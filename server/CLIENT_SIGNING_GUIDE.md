# Client-Side App Session Signing Guide

## Problem
Yellow Network error: `"missing signature for participant 0x02F499..."`

This means Yellow Network **cannot verify** the signature. This happens when:
1. Client signs with main wallet instead of session key
2. Client doesn't use the correct signing approach from `@yellow-org/sdk`
3. Client modifies the `hashToSign` before signing
4. Session key wasn't properly authorized

## Critical Requirements

⚠️ **MUST use SESSION KEY to sign, NOT main wallet**
⚠️ **MUST use `AppSessionKeySignerV1` + `EthereumMsgSigner` from `@yellow-org/sdk`**
⚠️ **MUST sign the EXACT `hashToSign` hex string from server (don't modify it)**
⚠️ **Session key MUST be properly authorized via EIP-712 auth**

## How Client Must Sign

When the client receives `appSession:signatureRequest` or `appSession:startGameRequest`:

```javascript
// Message from server
{
  type: 'appSession:signatureRequest', // or 'appSession:startGameRequest'
  roomId: 'room-id',
  appDefinition: {...},
  participants: [...],
  hashToSign: '0x...'  // Hex hash to sign
}
```

### ✅ CORRECT Approach: Step-by-Step

#### Step 1: Setup Session Key Signer (Do this ONCE during auth)

```typescript
import { EthereumMsgSigner, AppSessionKeySignerV1 } from '@yellow-org/sdk';
import type { Hex } from 'viem';

// Create ephemeral session key (already generated during key pair setup)
const sessionKeyPrivateKey: Hex = '0x...'; // from stored key pair

// Create signers
const innerSigner = new EthereumMsgSigner(sessionKeyPrivateKey);
const signer = new AppSessionKeySignerV1(innerSigner);
```

#### Step 2: Sign the Hash

```typescript
// When server sends appSession:signatureRequest or appSession:startGameRequest
const { hashToSign, roomId } = serverMessage;

// Sign the hash using session key signer
const signature = await signer.signMessage(hashToSign as Hex);

// Send signature back to server
ws.send(JSON.stringify({
  type: 'appSession:signature', // or 'appSession:startGame'
  payload: {
    roomId,
    signature
  }
}));
```

### ❌ WRONG Approaches

**Don't sign with main wallet:**
```typescript
// ❌ WRONG - Must use session key, not main wallet!
const signature = await mainWallet.signMessage(hashToSign);
```

**Don't modify the hash:**
```typescript
// ❌ WRONG - Must use exact hashToSign from server!
const modifiedHash = '0x' + hashToSign.slice(2).toUpperCase();
const signature = await signer.signMessage(modifiedHash);
```

**Don't use raw ethers signing:**
```typescript
// ❌ WRONG - Must use AppSessionKeySignerV1!
const signature = await wallet.signMessage(hashToSign);
```

## Key Points

1. **Use SESSION KEY** - The signature must come from the session key that was authorized via EIP-712 auth
2. **Use SDK Signers** - Use `EthereumMsgSigner` + `AppSessionKeySignerV1` from `@yellow-org/sdk`
3. **Use Exact Hash** - Sign the exact `hashToSign` received from server
4. **Signature is returned directly** - No need to parse JSON or extract from arrays

## Verification

The signature will be verified by Yellow Network against:
- The participant address in `participants` array (main wallet address)
- The session key that was authorized for that wallet
- The exact hash being submitted

## Troubleshooting Checklist

### 1. Check Session Key Setup
```typescript
// ❌ WRONG - Using main wallet
const signer = new EthereumMsgSigner(mainWalletPrivateKey);

// ✅ CORRECT - Using session key
const innerSigner = new EthereumMsgSigner(sessionKeyPrivateKey);
const signer = new AppSessionKeySignerV1(innerSigner);
```

### 2. Check SDK Import
```typescript
// ✅ CORRECT
import { EthereumMsgSigner, AppSessionKeySignerV1 } from '@yellow-org/sdk';
```

### 3. Check hashToSign Usage
```typescript
// ❌ WRONG - Modified hash
const sig = await signer.signMessage(hashToSign + 'extra');

// ✅ CORRECT - Use exact hash from server
const sig = await signer.signMessage(hashToSign as Hex);
```

### 4. Verify Signature Format
The signature should:
- Start with `"0x"`
- Be exactly 132 characters long
- Be a hex string (0-9, a-f)

### 5. Check Console for Errors
Look for:
- "No session key available for signing"
- "Unknown signing error"
- Network errors

### 6. Common Mistakes

**Mistake 1: Signing with main wallet**
```typescript
// ❌ WRONG
const mainSigner = new EthereumMsgSigner(mainWalletKey);
await mainSigner.signMessage(hashToSign);
```

**Mistake 2: Not storing session key**
```typescript
// ❌ WRONG - Creates new key each time
const key = generateKeyPair();
const signer = new EthereumMsgSigner(key.privateKey);

// ✅ CORRECT - Store and reuse from localStorage
const storedKey = localStorage.getItem('crypto_keypair');
const signer = new EthereumMsgSigner(storedKey.privateKey);
```

**Mistake 3: Using wrong signer class**
```typescript
// ❌ WRONG - EthereumMsgSigner alone
const sig = await new EthereumMsgSigner(key).signMessage(hash);

// ✅ CORRECT - Wrapped in AppSessionKeySignerV1
const inner = new EthereumMsgSigner(key);
const signer = new AppSessionKeySignerV1(inner);
const sig = await signer.signMessage(hash);
```

## Quick Debug Steps

1. **Verify wallet address** - Check wallet address matches one in participants array
2. **Verify session key exists** - `console.log(sessionKey.address)`
3. **Verify using SDK signers** - Check using `AppSessionKeySignerV1` from `@yellow-org/sdk`
4. **Verify signature format** - Should be "0x..." and 132 chars
5. **Verify exact hash** - Don't modify `hashToSign` before signing
