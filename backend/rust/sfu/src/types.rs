use crate::broadcaster::TrackBroadcaster;
use crate::id_types::{RoomId, StreamId, TrackId, UserId};
use crate::pb::sfu::SfuEvent;
use crate::peer_manager::Peer;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tonic::Status;

/// Unique identifier for a user session within a room: `(RoomId, UserId)`.
pub type SessionKey = (RoomId, UserId);

/// Unique identifier for a specific track: `(RoomId, UserId, StreamId, TrackId)`.
pub type TrackKey = (RoomId, UserId, StreamId, TrackId);

/// Channel type for sending `SfuEvent` messages back to the signaling service (via gRPC).
/// The `Status` error type indicates gRPC stream errors.
pub type EventSender = mpsc::Sender<Result<SfuEvent, Status>>;

/// A thread-safe, concurrent map storing active peers, keyed by `SessionKey`.
pub type PeerMap = Arc<DashMap<SessionKey, Peer>>;

/// A thread-safe, concurrent map storing active track broadcasters, keyed by `TrackKey`.
pub type TrackMap = Arc<DashMap<TrackKey, Arc<TrackBroadcaster>>>;

/// A thread-safe, mutable option for the event sender.
/// Allows re-assignment or closing of the signaling channel.
pub type SharedEventSender = Arc<Mutex<Option<EventSender>>>;

/// A thread-safe, read-write locked list of subscribers (writers) attached to a broadcaster.
pub type SharedBroadcasterWriters = Arc<RwLock<Vec<crate::broadcaster::BroadcasterWriter>>>;

/// A thread-safe mapping of `StreamId` to the `UserId` of the original publisher.
/// Used by subscribers to identify the source of a track they are receiving.
pub type PeerTrackMapping = Arc<DashMap<StreamId, UserId>>;
