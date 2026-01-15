use dashmap::DashMap;
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct RoomManager {
    // Map RoomID -> Vec<UserID>
    pub rooms: Arc<DashMap<String, Vec<String>>>,
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
        }
    }

    /// Adds a user to a room. Returns true if a NEW room was created.
    pub fn add_user(&self, room_id: String, user_id: String) -> bool {
        let mut room_created = false;
        let mut users = self.rooms.entry(room_id).or_insert_with(|| {
            room_created = true;
            Vec::new()
        });
        if !users.contains(&user_id) {
            users.push(user_id);
        }
        room_created
    }

    /// Removes a user from a room. Returns true if the room became empty and was removed.
    pub fn remove_user(&self, room_id: &str, user_id: &str) -> bool {
        let mut room_removed = false;
        if let Some(mut users) = self.rooms.get_mut(room_id) {
            if let Some(pos) = users.iter().position(|u| u == user_id) {
                users.remove(pos);
            }
            if users.is_empty() {
                // Determine we should remove it.
                // We can't remove while holding the refmut.
                // We'll return true to signal caller (or handle clean up separately).
                // Actually DashMap supports remove_if or we can just drop the ref and remove.
                // But simply updating the metric based on "is_empty" is enough for now,
                // assuming we treat "empty room" as "inactive".
                // Let's actually remove it to be clean.
                room_removed = true;
            }
        }

        if room_removed {
            self.rooms.remove(room_id);
        }
        room_removed
    }

    /// Returns a list of UserIDs in a room.
    pub fn get_users(&self, room_id: &str) -> Vec<String> {
        if let Some(users) = self.rooms.get(room_id) {
            users.clone()
        } else {
            Vec::new()
        }
    }
}
