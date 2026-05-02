# Notification System Design

## Stage 1

For this platform, students need to see real-time updates for Placements, Events, and Results when they're logged in. I've designed the REST API around these actions:

- Fetching notifications
- Marking them as read (one or all)
- Sending notifications (admin)
- Deleting notifications
- Real-time delivery with WebSockets

---

### Headers

All routes are protected with JWT. Every request should include:

```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

---

### Endpoints

#### GET /api/v1/notifications
Fetch all notifications for the logged in student.

Response:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement | Event | Result",
      "message": "string",
      "isRead": false,
      "timestamp": "2026-04-22T17:51:30Z"
    }
  ]
}
```

---

#### PATCH /api/v1/notifications/:id/read
Mark a single notification as read.

Response:
```json
{
  "message": "Notification marked as read"
}
```

---

#### PATCH /api/v1/notifications/read-all
Mark all notifications as read at once.

Response:
```json
{
  "message": "All notifications marked as read"
}
```

---

#### POST /api/v1/notifications
Admin only — broadcast a notification to one or more students.

Request:
```json
{
  "type": "Placement | Event | Result",
  "message": "string",
  "studentIds": ["uuid"]
}
```

Response:
```json
{
  "message": "Notification sent",
  "notificationId": "uuid"
}
```

---

#### DELETE /api/v1/notifications/:id
Delete a notification by ID.

Response:
```json
{
  "message": "Notification deleted"
}
```

---

### Real-Time Notifications

I went with WebSockets (Socket.io) for real-time delivery. When a student logs in, they join a room identified by their `studentId`. Whenever an admin sends a notification, the server emits directly to the relevant rooms — no polling needed.

```js
// student joins their room on login
socket.join(studentId);

io.to(studentId).emit("notification", { type, message, timestamp });
```