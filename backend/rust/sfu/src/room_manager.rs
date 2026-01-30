use crate::id_types::{RoomId, UserId};
use dashmap::DashMap;
use tracing::info;

pub struct RoomManager {
    // Map RoomID -> List of UserIDs
    rooms: DashMap<RoomId, Vec<UserId>>,
}

impl RoomManager {
    pub fn new() -> Self {
        RoomManager {
            rooms: DashMap::new(),
        }
    }
}

impl Default for RoomManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RoomManager {
    pub fn add_user(&self, room_id: RoomId, user_id: UserId) -> bool {
        let mut new_room = false;
        self.rooms
            .entry(room_id.clone())
            .and_modify(|users| {
                if !users.contains(&user_id) {
                    users.push(user_id.clone());
                }
            })
            .or_insert_with(|| {
                new_room = true;
                vec![user_id]
            });

        if new_room {
            info!(room = %room_id, "New room created");
        }
        new_room
    }

    pub fn remove_user(&self, room_id: &RoomId, user_id: &UserId) -> bool {
        let mut room_empty = false;
        if let Some(mut users) = self.rooms.get_mut(room_id) {
            users.retain(|u| u != user_id);
            if users.is_empty() {
                room_empty = true;
            }
        }

        if room_empty {
            self.rooms.remove(room_id);
            info!(room = %room_id, "Room empty, removed");
            true
        } else {
            false
        }
    }

    pub fn get_users(&self, room_id: &RoomId) -> Vec<UserId> {
        self.rooms
            .get(room_id)
            .map(|users| users.value().clone())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_and_get_users() {
        let manager = RoomManager::new();
        let room_id = RoomId::from("room1");
        let user_1 = UserId::from("user1");
        let user_2 = UserId::from("user2");

        // Add first user
        assert!(manager.add_user(room_id.clone(), user_1.clone()));
        let users = manager.get_users(&room_id);
        assert_eq!(users.len(), 1);
        assert!(users.contains(&user_1));

        // Add second user
        assert!(!manager.add_user(room_id.clone(), user_2.clone())); // Should return false as room exists
        let users = manager.get_users(&room_id);
        assert_eq!(users.len(), 2);
        assert!(users.contains(&user_2));

        // Add duplicate user (should handle gracefully, though not strictly de-duped by Vec in implementation yet?
        // Checking implementation: uses `!users.contains(&user_id)` check.
        manager.add_user(room_id.clone(), user_1.clone());
        let users = manager.get_users(&room_id);
        assert_eq!(users.len(), 2);
    }

    #[test]
    fn test_remove_user() {
        let manager = RoomManager::new();
        let room_id = RoomId::from("room1");
        let user_1 = UserId::from("user1");

        manager.add_user(room_id.clone(), user_1.clone());
        assert!(!manager.get_users(&room_id).is_empty());

        // Remove user
        let room_removed = manager.remove_user(&room_id, &user_1);
        assert!(room_removed); // Room should be removed as it's empty
        assert!(manager.get_users(&room_id).is_empty());

        // Remove non-existent user
        assert!(!manager.remove_user(&room_id, &user_1));
    }

    #[test]
    fn test_multiple_rooms() {
        let manager = RoomManager::new();
        let room_1 = RoomId::from("room1");
        let room_2 = RoomId::from("room2");
        let user = UserId::from("user1");

        manager.add_user(room_1.clone(), user.clone());
        manager.add_user(room_2.clone(), user.clone());

        assert_eq!(manager.get_users(&room_1).len(), 1);
        assert_eq!(manager.get_users(&room_2).len(), 1);
    }
}
