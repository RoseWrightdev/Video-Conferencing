#[cfg(test)]
mod tests {
    use super::*;
    use crate::pb::cc::captioning_service_server::{CaptioningService, CaptioningServiceServer};
    use crate::pb::cc::{AudioChunk, CaptionEvent};
    use tokio_stream::wrappers::ReceiverStream;
    use tonic::transport::Server;
    use tonic::{Request, Response, Status};

    // Mock gRPC Service
    struct MockCaptioningService;

    #[tonic::async_trait]
    impl CaptioningService for MockCaptioningService {
        type StreamAudioStream = ReceiverStream<Result<CaptionEvent, Status>>;

        async fn stream_audio(
            &self,
            request: Request<tonic::Streaming<AudioChunk>>,
        ) -> Result<Response<ReceiverStream<Result<CaptionEvent, Status>>>, Status> {
            let mut in_stream = request.into_inner();
            let (tx, rx) = tokio::sync::mpsc::channel(4);

            tokio::spawn(async move {
                while let Ok(Some(chunk)) = in_stream.message().await {
                    // echo back a mock caption
                    let event = CaptionEvent {
                        session_id: chunk.session_id,
                        text: "Mock Caption".to_string(),
                        is_final: true,
                        confidence: 1.0,
                    };
                    let _ = tx.send(Ok(event)).await;
                }
            });

            Ok(Response::new(ReceiverStream::new(rx)))
        }
    }

    #[tokio::test]
    async fn test_grpc_client_integration() {
        // 1. Start Mock Server
        let addr = "[::1]:50059".parse().unwrap();
        let service = MockCaptioningService;

        let serve_future = Server::builder()
            .add_service(CaptioningServiceServer::new(service))
            .serve(addr);

        tokio::spawn(serve_future);

        // Give it a moment to bind
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        // 2. Connect Client
        let channel = tonic::transport::Endpoint::from_static("http://[::1]:50059")
            .connect()
            .await
            .expect("Failed to connect to mock server");

        let mut client =
            crate::pb::cc::captioning_service_client::CaptioningServiceClient::new(channel);

        // 3. Send Audio Stream
        let (tx, rx) = tokio::sync::mpsc::channel(4);
        let request = Request::new(ReceiverStream::new(rx));

        tokio::spawn(async move {
            let chunk = AudioChunk {
                session_id: "test-session".to_string(),
                audio_data: vec![0u8; 100],
            };
            tx.send(chunk).await.unwrap();
        });

        // 4. Verify Response
        let response = client.stream_audio(request).await.expect("RPC failed");
        let mut inbound = response.into_inner();

        if let Some(event) = inbound.message().await.unwrap() {
            assert_eq!(event.text, "Mock Caption");
            assert_eq!(event.session_id, "test-session");
        } else {
            panic!("No response received");
        }
    }
}
