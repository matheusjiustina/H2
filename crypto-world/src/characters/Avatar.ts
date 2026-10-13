import { Quaternion, Vector3 } from 'three';
import { Appearance } from './Appearance';
import { CharacterRig } from './CharacterRig';
import { CharacterAnimator } from './CharacterAnimator';
import { orientQuat } from '../world/RegionFrame';
import { damp } from '../core/math/sphere';

const _q = new Quaternion();

/** A rig + animator placed on the sphere. Shared by the player and every NPC. */
export class Avatar {
  readonly rig: CharacterRig;
  readonly anim: CharacterAnimator;
  private initialised = false;

  constructor(look: Appearance) {
    this.rig = new CharacterRig(look);
    this.anim = new CharacterAnimator(this.rig);
  }

  get group() {
    return this.rig.group;
  }

  /** Positions the character with feet at `feet`, standing along `up`, facing `forward`. */
  place(feet: Vector3, up: Vector3, forward: Vector3, dt: number, turnSmoothing = 14): void {
    orientQuat(up, forward, _q);
    if (!this.initialised || dt <= 0) {
      this.group.quaternion.copy(_q);
      this.initialised = true;
    } else {
      this.group.quaternion.slerp(_q, damp(turnSmoothing, dt));
    }
    this.group.position.copy(feet);
  }

  dispose(): void {
    this.rig.dispose();
  }
}

/** The messenger's default look: amber courier jacket, teal messenger bag, navy cap. */
export const PLAYER_LOOK: Appearance = {
  skin: '#efc3a1',
  hair: '#4a3226',
  hairStyle: 'swoop',
  top: '#e8823a',
  topStyle: 'jacket',
  topAccent: '#f4efe6',
  bottom: '#2d4060',
  shoes: '#f4efe6',
  hat: 'cap',
  hatColor: '#2d4060',
  bag: 'messenger',
  bagColor: '#2f8f8f',
  blush: true,
};
