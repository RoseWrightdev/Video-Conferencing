pub mod pb {
    pub mod signaling {
        include!("generated/signaling.rs");
    }
    pub mod sfu {
        include!("generated/sfu.rs");
    }
}

pub mod broadcaster;
pub mod media_setup;
pub mod peer_manager;
pub mod sfu_service;
pub mod signaling_handler;
pub mod track_handler;
pub mod types;

pub use media_setup::MediaSetup;
pub use peer_manager::Peer;
pub use types::{PeerMap, TrackMap};

#[cfg(test)]
mod tests;
