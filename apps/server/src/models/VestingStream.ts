import { Insertable, Selectable, Updateable } from 'kysely'

import { VestingStreamsTable } from '@/infrastructure/database/schema'

export type VestingStream = Selectable<VestingStreamsTable>
export type NewVestingStream = Insertable<VestingStreamsTable>
export type VestingStreamUpdate = Updateable<VestingStreamsTable>
