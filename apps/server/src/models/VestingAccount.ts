import { Insertable, Selectable, Updateable } from 'kysely'

import { VestingAccountsTable } from '@/infrastructure/database/schema'

export type VestingAccount = Selectable<VestingAccountsTable>
export type NewVestingAccount = Insertable<VestingAccountsTable>
export type VestingAccountUpdate = Updateable<VestingAccountsTable>
