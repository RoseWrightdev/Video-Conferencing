fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Tell cargo to re-run this script if .proto files change
    println!("cargo:rerun-if-changed=../../proto/sfu.proto");
    println!("cargo:rerun-if-changed=../../proto/signaling.proto");

    // 2. Compile the protos
    tonic_build::configure()
        .build_server(true)
        .build_client(false) // We are the server
        .compile(
            &["../../proto/sfu.proto"], // The input proto
            &["../../proto"],           // The proto root
        )?;

    Ok(())
}