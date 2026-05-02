# Notification System Design

## Stage 1

The goal of this system is:
students should receive real-time updates for placements, events, and results whenever they are logged in.

To achieve this, I designed a set of REST APIs that handle all the required operations:

- Fetch notifications
- Mark notifications as read (single or all)
- Send notifications (admin side)
- Delete notifications
- Real-time delivery using WebSockets

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

For real-time updates, I used WebSockets (Socket.io).

When a student logs in, they join a room based on their studentId. So instead of sending notifications to everyone, we can directly target specific users.

```js
// student joins their room on login
socket.join(studentId);

io.to(studentId).emit("notification", { type, message, timestamp });
```

## Stage 2

### Database Choice

I chose PostgreSQL because the data is structured and consistent. Every notification has the same fields, and queries are mostly based on student_id, so a relational database fits well here.

---

### Schema

```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  type VARCHAR(20) CHECK (type IN ('Placement', 'Event', 'Result')) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### Problems at Scale

When the system grows, a few issues can come up:

- Queries will slow down without indexes (full table scans)
- Fetching notifications from DB every time is expensive
- Notifications table will keep growing if we don’t clean it

### How to Fix It

- Add an index on (student_id, is_read, created_at) to speed up queries
- Use Redis to store unread counts instead of querying every time
- Add a cleanup job to remove or archive notifications older than 90 days

---

### Queries

**GET /api/v1/notifications** — fetch unread notifications for a student:

```sql
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC;
```

**PATCH /api/v1/notifications/read-all** — mark all as read:

```sql
UPDATE notifications
SET is_read = true
WHERE student_id = $1 AND is_read = false;
```

**PATCH /api/v1/notifications/:id/read** — mark one as read:

```sql
UPDATE notifications
SET is_read = true
WHERE id = $1 AND student_id = $2;
```

**DELETE /api/v1/notifications/:id**:

```sql
DELETE FROM notifications
WHERE id = $1 AND student_id = $2;
```

## Stage 3

The query:

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Is it correct?

Yes the query is correct it will work but it is slow because there's no index so it is going through all 5 million rows every time to find one student's unread notifications.

### What I'd fix

First add indexing and also drop SELECT \* and only fetch what is needed.

```sql
CREATE INDEX idx_notifications_student_unread
ON notifications(studentID, isRead, createdAt DESC);
```

This will make a big difference as instead of scanning the whole table it goes directly to the relevant rows.

### Should we index every column?

No we should not index every column. Indexes make reads faster but every write has to update them too. More indexes = slower insert. indexing what we have to querying is better.

### Students who got a placement notification in the last 7 days

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
AND createdAt >= NOW() - INTERVAL '7 days';
```

## Stage 4

The main problem is that hitting the DB every time a student opens the page will get slow as users increase. So the goal is just to reduce DB calls.

### Redis

Store each student's notifications in Redis for a bit. When the page loads, check Redis first if data's there, return it, otherwise go to the DB and cache the result. When a new notification comes in, update Redis too.

### Pagination

Instead of loading everything at once, just load 20 at a time. Load more when the user scrolls down. Reduces DB load.

### WebSockets

As we're already using sockets, new notifications can be pushed directly to the student without calling the API again.

Managing a lot of open socket connections can get difficult at scale.

### What I'd do

Just combine all three, Redis for caching faster loading, pagination so we're not fetching everything at once, and sockets for real-time updates.

## Stage 5

The current code:

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

### What's wrong here

Main issue is it’s doing everything one by one.

If there are like 50,000 students, this will take a lot of time.
Also if email fails at, say, student 200, then the loop breaks and rest of the students won’t get anything.

Also saving to DB inside the loop again and again is slow.

### What I'd do

First I’d save everything to DB in one go.

So at least notifications are stored and students can see them in the app.

Then for emails, I won’t send them directly. I’d use a queue.

```
function notify_all(student_ids: array, message: string):
    bulk_save_to_db(student_ids, message)

    for student_id in student_ids:
        push_to_app(student_id, message)
        enqueue_email(student_id, message)
```

Then a separate worker will handle emails:

```
function email_worker(student_id, message):
    try:
        send_email(student_id, message)
    except:
        retry(student_id, message)
```

### Should saving to DB and sending email happen together?

I don’t think so.

Saving to DB should happen first so notification is available in the app.

Email can happen later in background.
Even if it fails, it can retry, so nothing is lost.
