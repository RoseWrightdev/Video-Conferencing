// Package session - room_methods.go
//
// This file contains the core state manipulation methods for the Room struct.
// These methods directly modify room state and are NOT thread-safe by design.
// They should only be called when the room's mutex lock is already held by the caller.
//
// The methods are organized by functionality:
//   - Client role management (add/delete participants, hosts, waiting users)
//   - Screen sharing management
//   - Chat history management
//   - Hand raising management
//   - Client disconnection cleanup
//   - Room state queries
//
// Thread Safety Note:
// All methods in this file assume the caller holds the room's RWMutex lock.
// This design centralizes locking logic in the router and broadcast methods,
// preventing deadlocks and ensuring consistent state updates.
package session

import "container/list"

// addParticipant promotes a client to participant status and adds them to the main meeting.
// This method updates the client's role, adds them to the participants map, and places
// them in the client draw order queue for UI positioning.
//
// The client is added to the back of the draw order queue, meaning they appear
// at the end of the participant list initially.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to promote to participant status
func (r *Room) addParticipant(client *Client) {
	client.Role = RoleTypeParticipant
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.participants[client.ID] = client
}

// deleteParticipant removes a client from participant status and the main meeting.
// This method removes the client from the participants map and the client draw order queue.
// The client's draw order element reference is cleared to prevent memory leaks.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to remove from participant status
func (r *Room) deleteParticipant(client *Client) {
	delete(r.participants, client.ID)
	if client.drawOrderElement != nil {
		r.clientDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// addHost promotes a client to host status, granting them administrative privileges.
// This method updates the client's role, adds them to the hosts map, and places
// them in the client draw order queue. Hosts typically appear prominently in the UI.
//
// Host privileges include:
//   - Accepting/denying waiting room requests
//   - Managing screen sharing permissions
//   - Administrative control over the room
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to promote to host status
func (r *Room) addHost(client *Client) {
	client.Role = RoleTypeHost
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.hosts[client.ID] = client
}

// deleteHost removes a client from host status and revokes their administrative privileges.
// This method removes the client from the hosts map and the client draw order queue.
// The client's draw order element reference is cleared to prevent memory leaks.
//
// Note: Removing all hosts from a room may leave it without administrative control.
// Consider the implications before calling this method.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to remove from host status
func (r *Room) deleteHost(client *Client) {
	delete(r.hosts, client.ID)
	if client.drawOrderElement != nil {
		r.clientDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// addWaiting places a client in the waiting room, requiring host approval to join.
// This method updates the client's role, adds them to the waiting map, and places
// them at the front of the waiting draw order stack (LIFO - Last In, First Out).
//
// The waiting room acts as a holding area where hosts can review and approve
// new participants before they join the main meeting.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to place in the waiting room
func (r *Room) addWaiting(client *Client) {
	client.Role = RoleTypeWaiting
	element := r.waitingDrawOrderStack.PushFront(client)
	client.drawOrderElement = element
	r.waiting[client.ID] = client
}

// deleteWaiting removes a client from the waiting room.
// This method removes the client from the waiting map and the waiting draw order stack.
// The client's draw order element reference is cleared to prevent memory leaks.
//
// This is typically called when:
//   - A host accepts the waiting client (before promoting them)
//   - A host denies the waiting client
//   - The waiting client disconnects
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to remove from the waiting room
func (r *Room) deleteWaiting(client *Client) {
	delete(r.waiting, client.ID)
	if client.drawOrderElement != nil {
		r.waitingDrawOrderStack.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// addScreenshare grants a client screen sharing privileges and updates their role.
// This method adds the client to the screen sharing map and the client draw order queue.
// Clients with screen sharing privileges typically have their video prominently displayed.
//
// Screen sharing permissions are usually granted by hosts and may be limited
// to one or a small number of concurrent screen sharers.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to grant screen sharing privileges
func (r *Room) addScreenshare(client *Client) {
	client.Role = RoleTypeScreenshare
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.sharingScreen[client.ID] = client
}

// deleteScreenshare revokes a client's screen sharing privileges.
// This method removes the client from the screen sharing map and the client draw order queue.
// The client's draw order element reference is cleared to prevent memory leaks.
//
// This is typically called when:
//   - The client stops sharing their screen voluntarily
//   - A host revokes their screen sharing permission
//   - The client disconnects while screen sharing
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client whose screen sharing privileges should be revoked
func (r *Room) deleteScreenshare(client *Client) {
	delete(r.sharingScreen, client.ID)
	if client.drawOrderElement != nil {
		r.clientDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// addChat adds a new chat message to the room's chat history.
// This method appends the message to the end of the chat history list and
// enforces the maximum chat history length by removing older messages if necessary.
//
// Chat messages are stored in chronological order with the newest messages
// at the end of the list. The chat history is implemented as a doubly-linked
// list for efficient insertion and deletion operations.
//
// Memory Management:
// If maxChatHistoryLength is set (> 0), older messages are automatically
// removed when the history exceeds the limit, preventing unbounded memory growth.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: The chat message data to add to the history
func (r *Room) addChat(payload AddChatPayload) {
	// Add the chat message to the chat history list
	if r.chatHistory == nil {
		r.chatHistory = list.New()
	}

	// Add to the back of the list (newest messages at the end)
	r.chatHistory.PushBack(payload)

	// Enforce max chat history length
	if r.maxChatHistoryLength > 0 {
		for r.chatHistory.Len() > r.maxChatHistoryLength {
			r.chatHistory.Remove(r.chatHistory.Front())
		}
	}
}

// deleteChat removes a specific chat message from the room's chat history by ID.
// This method searches through the chat history to find a message with the matching
// ChatId and removes it from the list. Only the first matching message is removed.
//
// Use Cases:
//   - Message moderation (removing inappropriate content)
//   - User-initiated message deletion
//   - Administrative cleanup
//
// Performance Note:
// This operation has O(n) time complexity as it must search through the entire
// chat history to find the target message. For very large chat histories,
// consider implementing indexing if frequent deletions are expected.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: Contains the ChatId of the message to delete
func (r *Room) deleteChat(payload DeleteChatPayload) {
	if r.chatHistory == nil {
		return
	}

	// Iterate through the chat history to find and remove the message
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		if chatMsg, ok := e.Value.(AddChatPayload); ok {
			if chatMsg.ChatId == payload.ChatId {
				r.chatHistory.Remove(e)
				return
			}
		}
	}
}

// getRecentChats retrieves the most recent chat messages from the room's history.
// This method converts the chat history linked list to a slice and returns
// the most recent messages up to the configured limit.
//
// Message Ordering:
// Messages are returned in chronological order (oldest first, newest last)
// to maintain conversation flow when displayed in the UI.
//
// Limit Behavior:
// Currently defaults to returning the last 50 messages. This limit helps
// control memory usage and network bandwidth when sending chat history
// to newly connected clients.
//
// Performance Characteristics:
// - Time complexity: O(n) where n is the total number of messages
// - Space complexity: O(min(n, limit)) for the returned slice
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: Request payload (currently unused but reserved for future filtering)
//
// Returns:
//   - Slice of chat messages in chronological order
func (r *Room) getRecentChats(payload GetRecentChatsPayload) []AddChatPayload {
	if r.chatHistory == nil {
		return []AddChatPayload{}
	}

	// Convert list to slice for easier handling
	messages := make([]AddChatPayload, 0, r.chatHistory.Len())
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		if chatMsg, ok := e.Value.(AddChatPayload); ok {
			messages = append(messages, chatMsg)
		}
	}

	// Return the most recent messages (from the end of the slice)
	// Default to last 50 messages if no specific limit is set
	limit := 50
	if len(messages) <= limit {
		return messages
	}
	return messages[len(messages)-limit:]
}

// disconnectClient performs comprehensive cleanup when a client leaves the room.
// This method removes the client from all possible room states to prevent
// memory leaks and ensure consistent room state after disconnection.
//
// Cleanup Operations:
//   - Removes from all role-based maps (hosts, participants, waiting)
//   - Removes from all state maps (raising hand, sharing screen, audio/video states)
//   - Cleans up draw order queue references
//   - Prevents dangling pointers and memory leaks
//
// Design Note:
// This method is designed to be safe to call multiple times for the same client.
// It will cleanly handle cases where the client isn't present in certain maps.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - client: The client to completely remove from the room
func (r *Room) disconnectClient(client *Client) {
	// Remove from role-based maps
	r.deleteHost(client)
	r.deleteParticipant(client)
	r.deleteWaiting(client)

	// Remove from state maps
	delete(r.raisingHand, client.ID)
	delete(r.sharingScreen, client.ID)
	delete(r.unmuted, client.ID)
	delete(r.cameraOn, client.ID)

	// Remove from hand raise queue if present
	if client.drawOrderElement != nil {
		r.handDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// isRoomEmpty determines whether the room has any active participants.
// A room is considered empty if it has no hosts, participants, or screen sharers.
// Waiting users are NOT counted as they haven't been admitted to the main meeting.
//
// Use Cases:
//   - Triggering room cleanup when the last participant leaves
//   - Deciding whether to close/archive empty rooms
//   - Resource management and memory cleanup
//
// Business Logic:
// Waiting room users don't count toward room occupancy because they haven't
// been admitted to the actual meeting. This prevents rooms from staying
// active indefinitely due to unapproved waiting users.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Returns:
//   - true if the room has no active participants (only waiting users or completely empty)
//   - false if there are any hosts, participants, or screen sharers
func (r *Room) isRoomEmpty() bool {
	return len(r.hosts) == 0 &&
		len(r.participants) == 0 &&
		len(r.sharingScreen) == 0
}

// raiseHand adds a participant to the hand-raising queue and updates their status.
// This method allows participants to request speaking time or attention from hosts.
// The participant is added to both the raising hand map and the hand draw order queue.
//
// Queue Behavior:
// Participants are added to the back of the hand raise queue (FIFO - First In, First Out).
// This ensures fair ordering when multiple participants want to speak.
//
// Validation:
// Only participants can raise their hands. The method searches the participants
// map to verify the client exists and has the appropriate role.
//
// UI Integration:
// The hand raise status is typically displayed in the UI with visual indicators
// and the queue order helps hosts manage speaking turns.
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: Contains the ClientId of the participant raising their hand
func (r *Room) raiseHand(payload RaiseHandPayload) {
	// Find the client who wants to raise their hand
	client := r.participants[payload.ClientId]

	if client != nil {
		// Add to raising hand map
		r.raisingHand[client.ID] = client

		// Add to hand raise queue
		element := r.handDrawOrderQueue.PushBack(client)
		client.drawOrderElement = element
	}
}

// lowerHand removes a participant from the hand-raising queue and updates their status.
// This method allows participants to withdraw their request to speak or is called
// when a host acknowledges their raised hand.
//
// Cleanup Operations:
//   - Removes from the raising hand map
//   - Removes from the hand draw order queue
//   - Clears the draw order element reference to prevent memory leaks
//
// Queue Management:
// When a participant lowers their hand, they are removed from their current
// position in the queue, which may affect the ordering of other participants.
//
// Use Cases:
//   - Participant voluntarily lowers their hand
//   - Host acknowledges the participant (they can now speak)
//   - Administrative reset of hand-raising status
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: Contains the ClientId of the participant lowering their hand
func (r *Room) lowerHand(payload LowerHandPayload) {
	// Find the client who wants to lower their hand
	client := r.participants[payload.ClientId]

	if client != nil {
		// Remove from raising hand map
		delete(r.raisingHand, client.ID)

		// Remove from hand raise queue
		if client.drawOrderElement != nil {
			r.handDrawOrderQueue.Remove(client.drawOrderElement)
			client.drawOrderElement = nil
		}
	}
}

// toggleAudio updates a participant's audio (microphone) state in the room.
// This method manages the unmuted map, adding the client when audio is enabled
// and removing them when audio is disabled (muted).
//
// State Management:
//   - enabled=true: Adds client to unmuted map (microphone on)
//   - enabled=false: Removes client from unmuted map (microphone off/muted)
//
// The unmuted map is used to:
//   - Track which participants have their microphone enabled
//   - Display muted/unmuted indicators in the UI
//   - Include in room_state broadcasts for state synchronization
//
// Use Cases:
//   - Participant toggles their microphone on/off
//   - Host remotely mutes a participant (future feature)
//   - Initial media state setup when joining
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: Contains the ClientId and enabled state for the audio toggle
func (r *Room) toggleAudio(payload ToggleAudioPayload) {
	// Find the client in participants map
	client := r.participants[payload.ClientId]

	// Also check hosts map
	if client == nil {
		client = r.hosts[payload.ClientId]
	}

	if client != nil {
		if payload.Enabled {
			r.unmuted[client.ID] = client
		} else {
			delete(r.unmuted, client.ID)
		}
	}
}

// toggleVideo updates a participant's video (camera) state in the room.
// This method manages the cameraOn map, adding the client when video is enabled
// and removing them when video is disabled (camera off).
//
// State Management:
//   - enabled=true: Adds client to cameraOn map (camera on)
//   - enabled=false: Removes client from cameraOn map (camera off)
//
// The cameraOn map is used to:
//   - Track which participants have their camera enabled
//   - Display camera on/off indicators in the UI
//   - Include in room_state broadcasts for state synchronization
//
// Use Cases:
//   - Participant toggles their camera on/off
//   - Host remotely disables a participant's video (future feature)
//   - Initial media state setup when joining
//
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
//
// Parameters:
//   - payload: Contains the ClientId and enabled state for the video toggle
func (r *Room) toggleVideo(payload ToggleVideoPayload) {
	// Find the client in participants map
	client := r.participants[payload.ClientId]

	// Also check hosts map
	if client == nil {
		client = r.hosts[payload.ClientId]
	}

	if client != nil {
		if payload.Enabled {
			r.cameraOn[client.ID] = client
		} else {
			delete(r.cameraOn, client.ID)
		}
	}
}

// getRoomStateUnsafe returns the current room state without acquiring any locks.
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
func (r *Room) getRoomState() RoomStatePayload {
	// Convert client maps to slices of ClientInfo
	hosts := make([]ClientInfo, 0, len(r.hosts))
	for _, client := range r.hosts {
		hosts = append(hosts, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	participants := make([]ClientInfo, 0, len(r.participants))
	for _, client := range r.participants {
		participants = append(participants, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	waitingUsers := make([]ClientInfo, 0, len(r.waiting))
	for _, client := range r.waiting {
		waitingUsers = append(waitingUsers, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	handsRaised := make([]ClientInfo, 0, len(r.raisingHand))
	for _, client := range r.raisingHand {
		handsRaised = append(handsRaised, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	sharingScreen := make([]ClientInfo, 0, len(r.sharingScreen))
	for _, client := range r.sharingScreen {
		sharingScreen = append(sharingScreen, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	unmuted := make([]ClientInfo, 0, len(r.unmuted))
	for _, client := range r.unmuted {
		unmuted = append(unmuted, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	cameraOn := make([]ClientInfo, 0, len(r.cameraOn))
	for _, client := range r.cameraOn {
		cameraOn = append(cameraOn, ClientInfo{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		})
	}

	return RoomStatePayload{
		ClientInfo:    ClientInfo{}, // This will be set by the caller if needed
		RoomID:        r.ID,
		Hosts:         hosts,
		Participants:  participants,
		HandsRaised:   handsRaised,
		WaitingUsers:  waitingUsers,
		SharingScreen: sharingScreen,
		Unmuted:       unmuted,
		CameraOn:      cameraOn,
	}
}