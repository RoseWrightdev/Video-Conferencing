fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Get the proto directory path (relative to Cargo.toml location)
    let root_dir = "../../..";
    let proto_dir = "../../../proto";

    // 2. Tell cargo to re-run this script if .proto files change
    println!("cargo:rerun-if-changed={}/sfu.proto", proto_dir);
    println!("cargo:rerun-if-changed={}/signaling.proto", proto_dir);

    // 3. Compile the protos
    tonic_build::configure()
        .build_server(true)
        .build_client(false) // We are the server
        .out_dir("src/generated") // Explicitly set output directory
        .compile(
            &[
                &format!("{}/sfu.proto", proto_dir),
                &format!("{}/signaling.proto", proto_dir),
            ],
            &[root_dir], // Include path must be root so "proto/signaling.proto" resolves
        )?;

    Ok(())
}
