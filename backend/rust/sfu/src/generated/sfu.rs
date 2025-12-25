#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CreateSessionRequest {
    #[prost(string, tag = "1")]
    pub room_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub user_id: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CreateSessionResponse {
    /// The SFU always initiates the connection
    #[prost(string, tag = "1")]
    pub sdp_offer: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SignalMessage {
    #[prost(string, tag = "1")]
    pub room_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(oneof = "signal_message::Payload", tags = "3, 4, 5")]
    pub payload: ::core::option::Option<signal_message::Payload>,
}
/// Nested message and enum types in `SignalMessage`.
pub mod signal_message {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Payload {
        #[prost(string, tag = "3")]
        SdpAnswer(::prost::alloc::string::String),
        #[prost(string, tag = "4")]
        IceCandidate(::prost::alloc::string::String),
        #[prost(string, tag = "5")]
        SdpOffer(::prost::alloc::string::String),
    }
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SignalResponse {
    #[prost(bool, tag = "1")]
    pub success: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteSessionRequest {
    #[prost(string, tag = "1")]
    pub room_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub user_id: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteSessionResponse {
    #[prost(bool, tag = "1")]
    pub success: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ListenRequest {
    #[prost(string, tag = "1")]
    pub room_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub user_id: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SfuEvent {
    #[prost(oneof = "sfu_event::Payload", tags = "1, 2, 3, 4, 5, 6")]
    pub payload: ::core::option::Option<sfu_event::Payload>,
}
/// Nested message and enum types in `SfuEvent`.
pub mod sfu_event {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Payload {
        /// DEPRECATED: Use track_event
        #[prost(string, tag = "1")]
        TrackAddedUserId(::prost::alloc::string::String),
        /// DEPRECATED: Use track_event
        #[prost(string, tag = "2")]
        TrackAddedStreamId(::prost::alloc::string::String),
        #[prost(message, tag = "3")]
        TrackEvent(super::super::signaling::TrackAddedEvent),
        #[prost(string, tag = "4")]
        RenegotiateSdpOffer(::prost::alloc::string::String),
        #[prost(string, tag = "5")]
        SdpAnswer(::prost::alloc::string::String),
        #[prost(string, tag = "6")]
        IceCandidate(::prost::alloc::string::String),
    }
}
/// Generated server implementations.
pub mod sfu_service_server {
    #![allow(unused_variables, dead_code, missing_docs, clippy::let_unit_value)]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with SfuServiceServer.
    #[async_trait]
    pub trait SfuService: Send + Sync + 'static {
        /// 1. Initialize a new peer allocation in Rust
        /// Rust creates the PeerConnection and returns an SDP Offer immediately.
        async fn create_session(
            &self,
            request: tonic::Request<super::CreateSessionRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateSessionResponse>,
            tonic::Status,
        >;
        /// 2. Forward a signal from the Client (Answer/ICE) to Rust
        async fn handle_signal(
            &self,
            request: tonic::Request<super::SignalMessage>,
        ) -> std::result::Result<tonic::Response<super::SignalResponse>, tonic::Status>;
        /// 3. Cleanup when a user leaves
        async fn delete_session(
            &self,
            request: tonic::Request<super::DeleteSessionRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteSessionResponse>,
            tonic::Status,
        >;
        /// Server streaming response type for the ListenEvents method.
        type ListenEventsStream: futures_core::Stream<
                Item = std::result::Result<super::SfuEvent, tonic::Status>,
            >
            + Send
            + 'static;
        /// 4. Listen for asynchronous events from SFU (Tracks, Renegotiation)
        async fn listen_events(
            &self,
            request: tonic::Request<super::ListenRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::ListenEventsStream>,
            tonic::Status,
        >;
    }
    /// SfuService defines the gRPC interface for the Rust Selective Forwarding Unit (SFU).
    /// It handles peer session management, signaling, and media routing in the Data Plane.
    #[derive(Debug)]
    pub struct SfuServiceServer<T: SfuService> {
        inner: _Inner<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    struct _Inner<T>(Arc<T>);
    impl<T: SfuService> SfuServiceServer<T> {
        pub fn new(inner: T) -> Self {
            Self::from_arc(Arc::new(inner))
        }
        pub fn from_arc(inner: Arc<T>) -> Self {
            let inner = _Inner(inner);
            Self {
                inner,
                accept_compression_encodings: Default::default(),
                send_compression_encodings: Default::default(),
                max_decoding_message_size: None,
                max_encoding_message_size: None,
            }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> InterceptedService<Self, F>
        where
            F: tonic::service::Interceptor,
        {
            InterceptedService::new(Self::new(inner), interceptor)
        }
        /// Enable decompressing requests with the given encoding.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.accept_compression_encodings.enable(encoding);
            self
        }
        /// Compress responses with the given encoding, if the client supports it.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.send_compression_encodings.enable(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.max_decoding_message_size = Some(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.max_encoding_message_size = Some(limit);
            self
        }
    }
    impl<T, B> tonic::codegen::Service<http::Request<B>> for SfuServiceServer<T>
    where
        T: SfuService,
        B: Body + Send + 'static,
        B::Error: Into<StdError> + Send + 'static,
    {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future = BoxFuture<Self::Response, Self::Error>;
        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<std::result::Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, req: http::Request<B>) -> Self::Future {
            let inner = self.inner.clone();
            match req.uri().path() {
                "/sfu.SfuService/CreateSession" => {
                    #[allow(non_camel_case_types)]
                    struct CreateSessionSvc<T: SfuService>(pub Arc<T>);
                    impl<
                        T: SfuService,
                    > tonic::server::UnaryService<super::CreateSessionRequest>
                    for CreateSessionSvc<T> {
                        type Response = super::CreateSessionResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CreateSessionRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                (*inner).create_session(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = CreateSessionSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/sfu.SfuService/HandleSignal" => {
                    #[allow(non_camel_case_types)]
                    struct HandleSignalSvc<T: SfuService>(pub Arc<T>);
                    impl<T: SfuService> tonic::server::UnaryService<super::SignalMessage>
                    for HandleSignalSvc<T> {
                        type Response = super::SignalResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::SignalMessage>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                (*inner).handle_signal(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = HandleSignalSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/sfu.SfuService/DeleteSession" => {
                    #[allow(non_camel_case_types)]
                    struct DeleteSessionSvc<T: SfuService>(pub Arc<T>);
                    impl<
                        T: SfuService,
                    > tonic::server::UnaryService<super::DeleteSessionRequest>
                    for DeleteSessionSvc<T> {
                        type Response = super::DeleteSessionResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::DeleteSessionRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                (*inner).delete_session(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = DeleteSessionSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/sfu.SfuService/ListenEvents" => {
                    #[allow(non_camel_case_types)]
                    struct ListenEventsSvc<T: SfuService>(pub Arc<T>);
                    impl<
                        T: SfuService,
                    > tonic::server::ServerStreamingService<super::ListenRequest>
                    for ListenEventsSvc<T> {
                        type Response = super::SfuEvent;
                        type ResponseStream = T::ListenEventsStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListenRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                (*inner).listen_events(request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let inner = inner.0;
                        let method = ListenEventsSvc(inner);
                        let codec = tonic::codec::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.server_streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                _ => {
                    Box::pin(async move {
                        Ok(
                            http::Response::builder()
                                .status(200)
                                .header("grpc-status", "12")
                                .header("content-type", "application/grpc")
                                .body(empty_body())
                                .unwrap(),
                        )
                    })
                }
            }
        }
    }
    impl<T: SfuService> Clone for SfuServiceServer<T> {
        fn clone(&self) -> Self {
            let inner = self.inner.clone();
            Self {
                inner,
                accept_compression_encodings: self.accept_compression_encodings,
                send_compression_encodings: self.send_compression_encodings,
                max_decoding_message_size: self.max_decoding_message_size,
                max_encoding_message_size: self.max_encoding_message_size,
            }
        }
    }
    impl<T: SfuService> Clone for _Inner<T> {
        fn clone(&self) -> Self {
            Self(Arc::clone(&self.0))
        }
    }
    impl<T: std::fmt::Debug> std::fmt::Debug for _Inner<T> {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "{:?}", self.0)
        }
    }
    impl<T: SfuService> tonic::server::NamedService for SfuServiceServer<T> {
        const NAME: &'static str = "sfu.SfuService";
    }
}
