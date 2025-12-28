use crate::broadcaster::TrackBroadcaster;
use crate::pb::sfu::SfuEvent;
use crate::peer_manager::Peer;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tonic::Status;

/// (RoomID, UserID)
pub type SessionKey = (String, String);

/// (RoomID, UserID, StreamID, TrackID)
pub type TrackKey = (String, String, String, String);

/// Channel to send events back to the signaling server (Go)
pub type EventSender = mpsc::Sender<Result<SfuEvent, Status>>;

/// Thread-safe map of peers
pub type PeerMap = Arc<DashMap<SessionKey, Peer>>;

/// Thread-safe map of broadcasters
pub type TrackMap = Arc<DashMap<TrackKey, Arc<TrackBroadcaster>>>;

/// Wrapped event sender with mutex and option
pub type SharedEventSender = Arc<Mutex<Option<EventSender>>>;

/// Shared list of writers for a broadcaster
pub type SharedBroadcasterWriters = Arc<RwLock<Vec<crate::broadcaster::BroadcasterWriter>>>;
