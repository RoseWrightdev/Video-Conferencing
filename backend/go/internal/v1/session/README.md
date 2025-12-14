# Session Package Documentation

The `session` package provides a complete real-time video conferencing system built on WebSocket communication. It implements room-based video calls with chat, screen sharing, participant management, and role-based permissions.

## Architecture Overview

### Core Components

#### Hub (`hub.go`)

- Central coordinator for all video conference rooms
- Handles WebSocket upgrades and JWT authentication
- Manages room lifecycle (creation, retrieval, cleanup)
- Thread-safe room registry with automatic scaling

#### Room (`room.go`)

- Manages individual video conference sessions
- Maintains participant lists, chat history, and permissions
- Implements role-based access control
- Provides thread-safe state management with RWMutex

#### Client (`client.go`)

- Represents individual WebSocket connections
- Handles bidirectional message flow (readPump/writePump)
- Maintains connection state and room membership
- Provides graceful disconnection and cleanup

#### Types (`types.go`)

- Defines all data structures and enums
- WebSocket message formats and payload types
- Role definitions and event constants
- Input validation for security

### Supporting Components

#### Room Methods (`room_methods.go`)

- Direct state manipulation methods (non-thread-safe)
- Client role management (participants, hosts, waiting)
- Chat history management with memory limits
- Hand raising and screen sharing coordination

#### Handlers (`handlers.go`)

- Event processing for WebSocket messages
- Payload validation and business logic
- Broadcasting and direct client communication
- Error handling and security checks

#### Permissions (`permissions.go`)

- Role-based permission system
- Hierarchical access control
- Permission checking utilities
- Broadcast audience management

#### Utilities (`utils.go`)

- Environment configuration helpers
- Debug and logging utilities
- CORS origin management

## Permission System

The system implements a hierarchical role-based permission model:

### Role Hierarchy (least to most privileged)

1. **Waiting**: Users awaiting admission
   - Can request to join
   - Limited visibility

2. **Participant**: Active meeting participants
   - Full video/audio participation
   - Chat messaging
   - Hand raising
   - Screen sharing requests

3. **Screenshare**: Currently sharing screen
   - All participant permissions
   - Active screen sharing
   - Enhanced UI prominence

4. **Host**: Room administrators
   - All lower permissions
   - Accept/deny waiting users
   - Manage screen sharing permissions
   - Room administrative control

### Permission Checking

```go
// Example permission checks in router
if HasPermission(client.Role, HasParticipantPermission()) {
    r.handleAddChat(client, msg.Event, msg.Payload)
}

if HasPermission(client.Role, HasHostPermission()) {
    r.handleAcceptWaiting(client, msg.Event, msg.Payload)
}
```

## Message Flow

### WebSocket Communication

1. Client connects to `/ws/{feature}/{roomId}` endpoint
2. JWT token validated through query parameter
3. WebSocket upgrade performed
4. Client added to room (first user becomes host)
5. Two goroutines started: readPump and writePump

### Message Processing

```text
Client → WebSocket → readPump → JSON Parse → Router → Handler → Business Logic → Broadcast
```

### Event Types

- **Chat Events**: `add_chat`, `delete_chat`, `get_recent_chats`
- **Hand Raising**: `raise_hand`, `lower_hand`
- **Waiting Room**: `request_waiting`, `accept_waiting`, `deny_waiting`
- **Screen Sharing**: `request_screenshare`, `accept_screenshare`, `deny_screenshare`
- **Connection**: `connect`, `disconnect`

## Concurrency Design

### Thread Safety Strategy

- **Hub**: Mutex protects room registry
- **Room**: RWMutex with centralized locking in router
- **Client**: Goroutine-safe with channel communication
- **Room Methods**: Assume lock already held (not thread-safe)

### Locking Hierarchy

1. Hub mutex (short-lived, room lookup only)
2. Room RWMutex (held during message processing)
3. No nested locking to prevent deadlocks

### Goroutine Management

- Each client runs 2 goroutines (read/write pumps)
- Automatic cleanup on disconnection
- Channel-based communication prevents blocking

## Memory Management

### Chat History

- Configurable message limits (`maxChatHistoryLength`)
- Automatic cleanup of old messages
- Doubly-linked list for efficient insertion/deletion

### Client Cleanup

- Comprehensive disconnection handling
- Removal from all room states
- Draw order queue cleanup
- Callback-based room cleanup

### Room Lifecycle

- Dynamic creation on first client connection
- Automatic cleanup when last participant leaves
- Memory leak prevention through proper callbacks

## Security Features

### Authentication

- JWT token validation for all connections
- Auth0 integration with custom claims
- Token expiration and validation checks

### Input Validation

- Comprehensive payload validation
- Chat message length and content limits
- Client ID and display name verification
- Protection against malformed messages

### Permission Enforcement

- Role-based access control at router level
- Early permission checks before handler execution
- Security logging for unauthorized attempts

## Usage Examples

### Basic Room Setup

```go
// Create Hub with authentication
validator := auth.NewValidator(ctx, domain, audience)
hub := session.NewHub(validator)

// Setup routing
router.GET("/ws/chat/:roomId", hub.ServeWs)
```

### Client Connection Flow

```javascript
// Client-side WebSocket connection
const token = getJWTToken();
const ws = new WebSocket(`ws://localhost:8080/ws/chat/room123?token=${token}`);

// Send chat message
ws.send(JSON.stringify({
    event: "add_chat",
    payload: {
        clientId: "user123",
        displayName: "John Doe",
        chatId: "msg456",
        timestamp: Date.now(),
        chatContent: "Hello everyone!"
    }
}));
```

### Room Administration

```javascript
// Host accepts waiting user
ws.send(JSON.stringify({
    event: "accept_waiting",
    payload: {
        clientId: "waitingUser",
        displayName: "Jane Smith"
    }
}));
```

## Testing

The package includes comprehensive test coverage:

- **Unit Tests**: Individual component testing
- **Integration Tests**: Cross-component interaction
- **Mock Implementations**: TestRoom, MockConnection, MockRoom
- **Permission Tests**: Role-based access verification
- **Concurrency Tests**: Thread safety validation

### Running Tests

```bash
go test ./internal/v1/session/...
```

### Test Structure

- `*_test.go`: Unit tests for each component
- `NewTestRoom()`: Test room factory
- Mock interfaces for isolated testing
- Permission scenario validation

## Configuration

### Environment Variables

```bash
# CORS configuration
ALLOWED_ORIGINS="http://localhost:3000,https://myapp.com"

# Auth0 configuration  
AUTH0_DOMAIN="your-domain.auth0.com"
AUTH0_AUDIENCE="your-api-audience"
```

### Room Configuration

```go
// Room settings
maxChatHistoryLength := 100  // Maximum chat messages
onEmptyCallback := hub.removeRoom  // Cleanup function
```

## Deployment Considerations

### Scaling

- Stateless design enables horizontal scaling
- Room-based partitioning for load distribution
- WebSocket connection pooling

### Monitoring

- Structured logging with slog
- Connection metrics and room statistics
- Error tracking and alerting

### Production Hardening

- Rate limiting for message frequency
- Connection limits per room
- Resource usage monitoring
- Graceful shutdown handling

## API Reference

### WebSocket Endpoints

- `GET /ws/zoom/:roomId` - Video call connections
- `GET /ws/screenshare/:roomId` - Screen sharing connections  
- `GET /ws/chat/:roomId` - Chat-only connections

### Message Format

```json
{
    "event": "event_name",
    "payload": {
        // Event-specific data
    }
}
```

### Common Payloads

All payloads include basic client information:

```json
{
    "clientId": "unique-client-id",
    "displayName": "Human Readable Name"
}
```

Chat messages include additional fields:

```json
{
    "chatId": "message-id",
    "timestamp": 1234567890,
    "chatContent": "Message text"
}
```

## Error Handling

### Connection Errors

- Automatic reconnection on unexpected disconnects
- Graceful degradation for network issues
- Comprehensive error logging

### Validation Errors

- Input sanitization and validation
- Malformed message handling
- Security violation logging

### System Errors

- Resource exhaustion protection
- Memory leak prevention
- Graceful error recovery

This documentation provides a comprehensive overview of the session package architecture, usage patterns, and implementation details for developers working with the video conferencing system.
