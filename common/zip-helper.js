/**
 * 纯原生零外部依赖客户端 ZIP 压缩包读写工具
 * 支持导出打包标准 .zip 文件与解压读取 .zip 文件
 */

// CRC-32 校验表生成
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  CRC_TABLE[n] = c >>> 0;
}

function calculateCrc32(uint8Array) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < uint8Array.length; i++) {
    crc = CRC_TABLE[(crc ^ uint8Array[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 创建并打包标准 ZIP 文件 (Blob)
 * @param {Array<{ name: string, data: Uint8Array | string | Blob }>} files 待打包文件列表
 * @returns {Promise<Blob>} ZIP 压缩包 Blob
 */
export async function createZip(files) {
  const encoder = new TextEncoder();
  const fileEntries = [];

  for (const f of files) {
    let dataBytes;
    if (f.data instanceof Uint8Array) {
      dataBytes = f.data;
    } else if (f.data instanceof Blob) {
      const buf = await f.data.arrayBuffer();
      dataBytes = new Uint8Array(buf);
    } else if (typeof f.data === 'string') {
      dataBytes = encoder.encode(f.data);
    } else {
      dataBytes = encoder.encode(JSON.stringify(f.data));
    }

    const nameBytes = encoder.encode(f.name);
    const crc = calculateCrc32(dataBytes);
    fileEntries.push({
      name: f.name,
      nameBytes,
      dataBytes,
      crc,
      uncompressedSize: dataBytes.length,
      compressedSize: dataBytes.length
    });
  }

  // 计算总大小
  let localHeadersLength = 0;
  for (const entry of fileEntries) {
    localHeadersLength += 30 + entry.nameBytes.length + entry.dataBytes.length;
  }

  let centralDirLength = 0;
  for (const entry of fileEntries) {
    centralDirLength += 46 + entry.nameBytes.length;
  }

  const totalLength = localHeadersLength + centralDirLength + 22;
  const zipBuffer = new Uint8Array(totalLength);
  const view = new DataView(zipBuffer.buffer);

  let offset = 0;
  const centralDirOffsets = [];

  // 1. 写入各个文件的 Local File Headers 与 数据内容
  for (const entry of fileEntries) {
    centralDirOffsets.push(offset);

    // Signature: 0x04034b50 ("PK\x03\x04")
    view.setUint32(offset, 0x04034b50, true); offset += 4;
    // Version needed: 2.0 (20)
    view.setUint16(offset, 20, true); offset += 2;
    // General purpose bit flag: 0x0800 (UTF-8)
    view.setUint16(offset, 0x0800, true); offset += 2;
    // Compression method: 0 (Store)
    view.setUint16(offset, 0, true); offset += 2;
    // Last mod file time / date
    view.setUint16(offset, 0x5460, true); offset += 2;
    view.setUint16(offset, 0x5460, true); offset += 2;
    // CRC-32
    view.setUint32(offset, entry.crc, true); offset += 4;
    // Compressed size
    view.setUint32(offset, entry.compressedSize, true); offset += 4;
    // Uncompressed size
    view.setUint32(offset, entry.uncompressedSize, true); offset += 4;
    // Filename length
    view.setUint16(offset, entry.nameBytes.length, true); offset += 2;
    // Extra field length
    view.setUint16(offset, 0, true); offset += 2;

    // Filename
    zipBuffer.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;

    // File data
    zipBuffer.set(entry.dataBytes, offset);
    offset += entry.dataBytes.length;
  }

  const centralDirStartOffset = offset;

  // 2. 写入 Central Directory Headers
  for (let i = 0; i < fileEntries.length; i++) {
    const entry = fileEntries[i];
    const localOffset = centralDirOffsets[i];

    // Signature: 0x02014b50 ("PK\x01\x02")
    view.setUint32(offset, 0x02014b50, true); offset += 4;
    // Version made by: 20
    view.setUint16(offset, 20, true); offset += 2;
    // Version needed: 20
    view.setUint16(offset, 20, true); offset += 2;
    // Flags: 0x0800 (UTF-8)
    view.setUint16(offset, 0x0800, true); offset += 2;
    // Compression method: 0
    view.setUint16(offset, 0, true); offset += 2;
    // Mod time / date
    view.setUint16(offset, 0x5460, true); offset += 2;
    view.setUint16(offset, 0x5460, true); offset += 2;
    // CRC-32
    view.setUint32(offset, entry.crc, true); offset += 4;
    // Compressed size
    view.setUint32(offset, entry.compressedSize, true); offset += 4;
    // Uncompressed size
    view.setUint32(offset, entry.uncompressedSize, true); offset += 4;
    // Filename length
    view.setUint16(offset, entry.nameBytes.length, true); offset += 2;
    // Extra field length
    view.setUint16(offset, 0, true); offset += 2;
    // File comment length
    view.setUint16(offset, 0, true); offset += 2;
    // Disk number start
    view.setUint16(offset, 0, true); offset += 2;
    // Internal attributes
    view.setUint16(offset, 0, true); offset += 2;
    // External attributes
    view.setUint32(offset, 0x81A40000, true); offset += 4;
    // Local header offset
    view.setUint32(offset, localOffset, true); offset += 4;

    // Filename
    zipBuffer.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  }

  const centralDirEndOffset = offset;
  const centralDirSize = centralDirEndOffset - centralDirStartOffset;

  // 3. 写入 End of Central Directory Record
  view.setUint32(offset, 0x06054b50, true); offset += 4;
  view.setUint16(offset, 0, true); offset += 2;
  view.setUint16(offset, 0, true); offset += 2;
  view.setUint16(offset, fileEntries.length, true); offset += 2;
  view.setUint16(offset, fileEntries.length, true); offset += 2;
  view.setUint32(offset, centralDirSize, true); offset += 4;
  view.setUint32(offset, centralDirStartOffset, true); offset += 4;
  view.setUint16(offset, 0, true); offset += 2;

  return new Blob([zipBuffer], { type: 'application/zip' });
}

/**
 * 解压并读取 ZIP 文件
 * @param {Blob | ArrayBuffer | Uint8Array} zipInput 
 * @returns {Promise<Map<string, Uint8Array>>} 文件名 -> 文件二进制数据的 Map
 */
export async function extractZip(zipInput) {
  let arrayBuffer;
  if (zipInput instanceof Blob) {
    arrayBuffer = await zipInput.arrayBuffer();
  } else if (zipInput instanceof Uint8Array) {
    arrayBuffer = zipInput.buffer.slice(zipInput.byteOffset, zipInput.byteOffset + zipInput.byteLength);
  } else {
    arrayBuffer = zipInput;
  }

  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');
  const files = new Map();

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('无效的 ZIP 文件格式（未找到 EOCD 标识）');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  let currentCdOffset = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(currentCdOffset, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(currentCdOffset + 10, true);
    const compressedSize = view.getUint32(currentCdOffset + 20, true);
    const fileNameLength = view.getUint16(currentCdOffset + 28, true);
    const extraLength = view.getUint16(currentCdOffset + 30, true);
    const commentLength = view.getUint16(currentCdOffset + 32, true);
    const localHeaderOffset = view.getUint32(currentCdOffset + 42, true);

    const fileNameBytes = bytes.subarray(currentCdOffset + 46, currentCdOffset + 46 + fileNameLength);
    const fileName = decoder.decode(fileNameBytes);

    currentCdOffset += 46 + fileNameLength + extraLength + commentLength;

    if (fileName.endsWith('/')) continue;

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`损坏的 ZIP 条目: ${fileName}`);
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const rawData = bytes.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      files.set(fileName, rawData);
    } else if (compressionMethod === 8) {
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(rawData);
        writer.close();
        const res = await new Response(ds.readable).arrayBuffer();
        files.set(fileName, new Uint8Array(res));
      } else {
        throw new Error(`浏览器环境缺少 DecompressionStream 解压条目: ${fileName}`);
      }
    } else {
      throw new Error(`不支持的压缩算法: ${compressionMethod}`);
    }
  }

  return files;
}
