use std::fmt;
use std::sync::Arc;

/// A strongly typed identifier for a Room.
/// Wraps an `Arc<String>` for cheap cloning.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RoomId(pub Arc<String>);

/// A strongly typed identifier for a User.
/// Wraps an `Arc<String>` for cheap cloning.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(pub Arc<String>);

/// A strongly typed identifier for a Stream.
/// Wraps an `Arc<String>` for cheap cloning.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StreamId(pub Arc<String>);

/// A strongly typed identifier for a Track.
/// Wraps an `Arc<String>` for cheap cloning.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TrackId(pub Arc<String>);

// Implement Display for easy logging
impl fmt::Display for RoomId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl fmt::Display for StreamId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl fmt::Display for TrackId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

// Implement conversion from String/&str
impl From<String> for RoomId {
    fn from(s: String) -> Self {
        RoomId(Arc::new(s))
    }
}

impl From<&str> for RoomId {
    fn from(s: &str) -> Self {
        RoomId(Arc::new(s.to_string()))
    }
}

impl From<String> for UserId {
    fn from(s: String) -> Self {
        UserId(Arc::new(s))
    }
}

impl From<&str> for UserId {
    fn from(s: &str) -> Self {
        UserId(Arc::new(s.to_string()))
    }
}

impl From<String> for StreamId {
    fn from(s: String) -> Self {
        StreamId(Arc::new(s))
    }
}

impl From<&str> for StreamId {
    fn from(s: &str) -> Self {
        StreamId(Arc::new(s.to_string()))
    }
}

impl From<String> for TrackId {
    fn from(s: String) -> Self {
        TrackId(Arc::new(s))
    }
}

impl From<&str> for TrackId {
    fn from(s: &str) -> Self {
        TrackId(Arc::new(s.to_string()))
    }
}

// Helper for referencing the inner string
impl AsRef<str> for RoomId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for UserId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for StreamId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for TrackId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_room_id_conversion() {
        let id_str = "room-123";
        let id: RoomId = RoomId::from(id_str);
        assert_eq!(id.as_ref(), id_str);

        let id_string = String::from("room-456");
        let id2: RoomId = RoomId::from(id_string.clone());
        assert_eq!(id2.as_ref(), "room-456");
    }

    #[test]
    fn test_user_id_conversion() {
        let id = UserId::from("user-1");
        assert_eq!(id.to_string(), "user-1");
    }

    #[test]
    fn test_stream_id_conversion() {
        let id = StreamId::from("stream-1");
        assert_eq!(id.as_ref(), "stream-1");
    }

    #[test]
    fn test_track_id_conversion() {
        let id = TrackId::from("track-1");
        assert_eq!(id.as_ref(), "track-1");
    }

    #[test]
    fn test_display_trait() {
        let id = RoomId::from("room-string");
        assert_eq!(format!("{}", id), "room-string");
    }
}
