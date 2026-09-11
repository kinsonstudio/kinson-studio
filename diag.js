const fs = require('fs')
const crypto = require('crypto')

const buf = fs.readFileSync(process.argv[2])

const aesKey = Buffer.from('hzHRAmso5kInbaxW')

function rc4Decrypt(data, key, drop) {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff
    const t = S[i]; S[i] = S[j]; S[j] = t
  }
  const out = Buffer.alloc(data.length)
  let i = 0; j = 0
  for (let k = 0; k < data.length + drop; k++) {
    i = (i + 1) & 0xff
    j = (j + S[i]) & 0xff
    const t = S[i]; S[i] = S[j]; S[j] = t
    if (k >= drop) out[k - drop] = data[k - drop] ^ S[(S[i] + S[j]) & 0xff]
  }
  return out
}

function checkFmt(d) {
  if (d.slice(0,3).toString('latin1')==='ID3') return 'MP3(ID3)'
  if (d.slice(0,4).toString('latin1')==='fLaC') return 'FLAC'
  if (d.slice(0,4).toString('latin1')==='OggS') return 'OGG'
  if (d[0]===0xff && (d[1]&0xe0)===0xe0) return 'MP3(帧头)'
  return '未知'
}

// 解析密钥
let off = 10
const coreKeyLen = buf.readUInt32LE(off); off += 4
const coreKey = Buffer.alloc(coreKeyLen)
for (let i = 0; i < coreKeyLen; i++) coreKey[i] = buf[off + i] ^ 0x64
off += coreKeyLen
const d = crypto.createDecipheriv('aes-128-ecb', aesKey, null)
const decCore = Buffer.concat([d.update(coreKey), d.final()])
const rc4Key = decCore.slice(17)
console.log('RC4密钥长度:', rc4Key.length)

// 跳过metaKey
const metaKeyLen = buf.readUInt32LE(off); off += 4 + metaKeyLen
console.log('metaKey后偏移:', off)

// 两种结构
const structs = [
  { label: 'CRC4+gap5+img', audioOff: () => {
    let o = off + 4 + 5
    const il = buf.readUInt32LE(o); o += 4
    console.log('  imgLen(gap5):', il)
    return o + il
  }},
  { label: 'CRC4+gap1+img', audioOff: () => {
    let o = off + 4 + 1
    const il = buf.readUInt32LE(o); o += 4
    console.log('  imgLen(gap1):', il)
    return o + il
  }},
]

const drops = [0, 128, 256, 512, 1024]

for (const s of structs) {
  const ao = s.audioOff()
  console.log('\n=== ' + s.label + ' === 音频偏移:', ao)
  if (ao >= buf.length) { console.log('  超出文件'); continue }
  const enc = buf.slice(ao)
  for (const drop of drops) {
    const dec = rc4Decrypt(enc, rc4Key, drop)
    const fmt = checkFmt(dec)
    console.log(`  drop=${String(drop).padStart(4)}: ${dec.slice(0,8).toString('hex')} → ${fmt}`)
  }
}
