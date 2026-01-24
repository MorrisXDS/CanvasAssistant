# Notification Channels Specification

**Version:** 1.0
**Date:** January 21, 2026

---

## Overview

The notification system supports multiple output channels for alerting users about deadlines, policy changes, grade updates, and system events. Users can configure which channels to use and set preferences per channel.

---

## Supported Channels

### 1. In-App Notifications
- Default channel
- Real-time updates via reactive subscriptions
- Toast notifications for critical alerts
- Badge counts in system tray

### 2. Discord Integration
- Webhook-based delivery
- Customizable embed formatting
- Channel selection per course or category
- Support for @mention roles

```typescript
interface DiscordConfig {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  embedColor?: string;
  mentionRoleId?: string;
  enabledCategories: NotificationCategory[];
}
```

### 3. Email Notifications
- SMTP or provider-based (SendGrid, Mailgun)
- HTML and plain text templates
- Digest mode (daily/weekly summary)
- Unsubscribe link support

```typescript
interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun';
  recipientEmail: string;
  digestMode: 'instant' | 'daily' | 'weekly';
  enabledCategories: NotificationCategory[];
}
```

### 4. Webhooks (Generic)
- POST to custom endpoints
- Configurable payload format (JSON)
- HMAC signature for security
- Retry logic with exponential backoff

```typescript
interface WebhookConfig {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  enabledCategories: NotificationCategory[];
}
```

### 5. Push Notifications (Mobile App)
- Firebase Cloud Messaging (FCM)
- Apple Push Notification Service (APNS)
- Critical alerts bypass Do Not Disturb
- Action buttons for quick response

```typescript
interface PushConfig {
  fcmToken?: string;
  apnsToken?: string;
  criticalAlertsEnabled: boolean;
  enabledCategories: NotificationCategory[];
}
```

### 6. Telegram Bot
- Bot API integration
- Chat ID for direct messages
- Group support for shared notifications
- Inline buttons for actions

```typescript
interface TelegramConfig {
  botToken: string;
  chatId: string;
  parseMode: 'HTML' | 'Markdown';
  enabledCategories: NotificationCategory[];
}
```

### 7. Slack Integration
- Incoming webhooks
- Slack app for richer interactions
- Thread replies for related notifications
- Slash commands for status queries

```typescript
interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  channelId: string;
  enabledCategories: NotificationCategory[];
}
```

---

## Notification Categories

```typescript
type NotificationCategory =
  | 'deadline_approaching'      // Task due within threshold
  | 'deadline_passed'           // Task deadline missed
  | 'policy_update'             // Policy-related announcement
  | 'grade_posted'              // New grade available
  | 'announcement'              // Course announcement
  | 'sync_error'                // Sync failure
  | 'system_alert';             // Critical system notification
```

---

## Database Schema

```sql
CREATE TABLE notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_type TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  config TEXT NOT NULL,          -- JSON configuration
  is_enabled BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  last_sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_type, channel_name)
);

CREATE TABLE notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  min_priority TEXT DEFAULT 'medium',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  FOREIGN KEY(channel_id) REFERENCES notification_channels(id),
  UNIQUE(channel_id, category)
);

CREATE TABLE notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  status TEXT CHECK(status IN ('pending', 'sent', 'failed', 'retrying')),
  attempt_count INTEGER DEFAULT 0,
  last_error TEXT,
  scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY(notification_id) REFERENCES notifications(id),
  FOREIGN KEY(channel_id) REFERENCES notification_channels(id)
);
```

---

## Dispatcher Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ L3: Intelligence - Notification Generator                   │
│ - Determines when to send notifications                     │
│ - Assigns priority based on urgency                         │
│ - Queues to notification_queue                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ L4: Worker - Notification Dispatcher                        │
│ - Polls notification_queue                                  │
│ - Routes to appropriate channel handlers                    │
│ - Handles retries and failures                              │
│ - Respects quiet hours and preferences                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Channel Handlers                                            │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ Discord │ │  Email  │ │ Webhook │ │  Push   │ ...        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel Handler Interface

```typescript
interface NotificationChannelHandler {
  channelType: string;

  // Validate channel configuration
  validateConfig(config: unknown): { valid: boolean; errors?: string[] };

  // Send a notification
  send(notification: Notification, config: ChannelConfig): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }>;

  // Test channel connectivity
  test(config: ChannelConfig): Promise<{ success: boolean; error?: string }>;
}
```

---

## Example: Discord Handler

```typescript
class DiscordChannelHandler implements NotificationChannelHandler {
  channelType = 'discord';

  async send(notification: Notification, config: DiscordConfig) {
    const embed = {
      title: notification.title,
      description: notification.message,
      color: this.getPriorityColor(notification.priority_level),
      timestamp: new Date().toISOString(),
      footer: { text: 'Canvas Assistant' },
    };

    const payload = {
      username: config.username || 'Canvas Assistant',
      avatar_url: config.avatarUrl,
      embeds: [embed],
    };

    if (config.mentionRoleId) {
      payload.content = `<@&${config.mentionRoleId}>`;
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return {
      success: response.ok,
      error: response.ok ? undefined : await response.text(),
    };
  }
}
```

---

## Planned Features

- [ ] Database migrations for channel tables
- [ ] Channel handler implementations
- [ ] Notification dispatcher worker
- [ ] UI for channel management
- [ ] Quiet hours per channel
- [ ] Rate limiting per channel
- [ ] Notification batching/digest mode
- [ ] Delivery receipts and tracking
- [ ] Template customization per channel

---

## Priority

This feature is planned for **Phase 2+** after core sync and intelligence layers are complete.
