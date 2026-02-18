import { Insertable, Selectable, Updateable } from 'kysely'

import { AuditLogsTable } from '@/infrastructure/database/schema'

export type AuditLog = Selectable<AuditLogsTable>
export type NewAuditLog = Insertable<AuditLogsTable>
export type AuditLogUpdate = Updateable<AuditLogsTable>
