# VRM Bone Animation Reference (Pixiv VRM 0.x / 1.x normalized)

Quick reference for animating VRM models with `vrm.humanoid.getNormalizedBoneNode()`.
All rotations are in **radians** on **normalized** bones (so the same code works
across different rigs).

## Rotation axes (right-handed, model-relative)

| Axis | Meaning      | Positive direction         |
|------|--------------|----------------------------|
| X    | Pitch        | Tilt **forward / nod down**|
| Y    | Yaw          | Turn **to model's left**   |
| Z    | Roll         | Tilt **to model's right**  |

## Arms

```
upperArm.z   abduction (away from torso)
             rest pose ≈ +1.25 to +1.35 rad (left arm)
             right arm uses NEGATIVE z mirror

upperArm.x   swing
             +x = arm forward (gesture toward camera)
             -x = arm backward (DO NOT use as default — looks broken)

upperArm.y   internal/external humeral rotation (subtle, ±0.2)

lowerArm.y   elbow bend
             RIGHT arm: +y bends elbow inward (toward chest)
             LEFT  arm: -y bends elbow inward
             Do NOT use .z for elbow — it twists the forearm.

lowerArm.x   forearm supination/pronation (small, ±0.1)

hand.z       wrist flex / extend
hand.x       wrist deviation
```

## Head & neck

```
head.x   nod         (+x = look down)
head.y   turn        (+y = look to model's left)
head.z   tilt        (+z = ear-to-shoulder right)

Combined head + neck rotation should not exceed ±0.5 rad on any axis,
or the neck looks broken.
```

## Torso

```
spine.x / chest.x / upperChest.x   breathing (very small ±0.03)
hips.z                              hip sway (±0.025)
hips.y                              hip twist (±0.015)
```

## Legs (rarely animated for chat avatar)

```
upperLeg.x   hip flexion (raise knee forward)
lowerLeg.x   knee bend (always 0 or POSITIVE — knees do not bend backward)
foot.x       ankle dorsi/plantar flexion
```

## Resting pose for a stationary avatar (sitting/standing torso shot)

```
leftUpperArm:  z = +1.27, x = +0.05, y = +0.10
rightUpperArm: z = -1.27, x = +0.05, y = -0.10
leftLowerArm:  y = -0.15  (slight elbow bend inward)
rightLowerArm: y = +0.15
```

This keeps arms hanging slightly forward and inward, like a relaxed human,
not glued to the back of the body and not stuck in a T-pose.

## Speaking gestures — direction conventions

When `isSpeaking` and a "beat" fires:
- Add **+x** to upperArm (arm comes forward).
- Add **+y elbow bend** (right) or **-y elbow bend** (left) so the hand
  comes up in front of the chest, not behind the back.
- Combine with a small **head.x** nod (~ -0.05) for emphasis.

Never use negative `upperArm.x` for normal gestures — it pushes the arm
behind the torso, which reads as broken/unnatural.
