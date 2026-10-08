/**
 * All interior rooms. Each room component carries its own traceability header
 * (see also ROOMS[].sources in data/houseSpec.ts and docs/PDF_AUDIT.md).
 */
import { TvRoom } from '../rooms/TvRoom'
import { Kitchen } from '../rooms/Kitchen'
import { Gourmet } from '../rooms/Gourmet'
import { Laundry } from '../rooms/Laundry'
import { SocialBathroom } from '../rooms/SocialBathroom'
import { ExternalBathroom } from '../rooms/ExternalBathroom'
import { MasterSuite } from '../rooms/MasterSuite'
import { MasterCloset } from '../rooms/MasterCloset'
import { MasterBathroom } from '../rooms/MasterBathroom'
import { Bedrooms } from '../rooms/Bedrooms'
import { GameRoom } from '../rooms/GameRoom'
import { StorageRoom } from '../rooms/StorageRoom'

export function Interior() {
  return (
    <group>
      <TvRoom />
      <Kitchen />
      <Gourmet />
      <Laundry />
      <SocialBathroom />
      <ExternalBathroom />
      <MasterSuite />
      <MasterCloset />
      <MasterBathroom />
      <Bedrooms />
      <GameRoom />
      <StorageRoom />
    </group>
  )
}
