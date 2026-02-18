import { Insertable, Selectable, Updateable } from 'kysely'

import { NotificationsTable } from '@/infrastructure/database/schema'

export type Notification = Selectable<NotificationsTable>
export type NewNotification = Insertable<NotificationsTable>
export type NotificationUpdate = Updateable<NotificationsTable>
