import { Insertable, Selectable, Updateable } from 'kysely'

import { UsersTable } from '@/infrastructure/database/schema'

export type User = Selectable<UsersTable>
export type NewUser = Insertable<UsersTable>
export type UserUpdate = Updateable<UsersTable>
