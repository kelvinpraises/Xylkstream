import { Insertable, Selectable, Updateable } from 'kysely'

import { PluginRegistryTable } from '@/infrastructure/database/schema'

export type PluginRegistry = Selectable<PluginRegistryTable>
export type NewPluginRegistry = Insertable<PluginRegistryTable>
export type PluginRegistryUpdate = Updateable<PluginRegistryTable>
