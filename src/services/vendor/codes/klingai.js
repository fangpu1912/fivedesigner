const KLINGAI_API_URL = "https://api-beijing.klingai.com";

class Vendor {
  constructor(config) {
    this.config = config;
    this.accessKey = config.inputValues?.apiKey || "";
    this.secretKey = config.inputValues?.sk || "";
  }

  generateJwtToken() {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.accessKey,
      exp: now + 1800,
      nbf: now - 5,
    };

    const base64url = (obj) => {
      const json = JSON.stringify(obj);
      let binary = "";
      for (let i = 0; i < json.length; i++) {
        binary += String.fromCharCode(json.charCodeAt(i));
      }
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };

    const headerB64 = base64url(header);
    const payloadB64 = base64url(payload);
    const signInput = headerB64 + "." + payloadB64;

    const signature = this._hmacSha256(signInput, this.secretKey);
    return headerB64 + "." + payloadB64 + "." + signature;
  }

  _hmacSha256(message, key) {
    const keyBytes = this._stringToBytes(key);
    const msgBytes = this._stringToBytes(message);

    const blockSizedKey = this._padKey(keyBytes, 64);

    const oKeyPad = new Uint8Array(64);
    const iKeyPad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      oKeyPad[i] = blockSizedKey[i] ^ 0x5c;
      iKeyPad[i] = blockSizedKey[i] ^ 0x36;
    }

    const innerData = new Uint8Array(64 + msgBytes.length);
    innerData.set(iKeyPad, 0);
    innerData.set(msgBytes, 64);
    const innerHash = this._sha256(innerData);

    const outerData = new Uint8Array(64 + innerHash.length);
    outerData.set(oKeyPad, 0);
    outerData.set(innerHash, 64);
    const outerHash = this._sha256(outerData);

    let hex = "";
    for (let i = 0; i < outerHash.length; i++) {
      hex += outerHash[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  _stringToBytes(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  }

  _padKey(key, blockSize) {
    if (key.length > blockSize) {
      key = this._sha256(key);
    }
    const padded = new Uint8Array(blockSize);
    padded.set(key, 0);
    return padded;
  }

  _sha256(data) {
    const k = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const padded = this._padMessage(data);
    const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);

    for (let offset = 0; offset < padded.length; offset += 64) {
      const w = new Uint32Array(64);
      for (let i = 0; i < 16; i++) {
        w[i] = view.getUint32(offset + i * 4, false);
      }
      for (let i = 16; i < 64; i++) {
        const s0 = this._rotr(w[i - 15], 7) ^ this._rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = this._rotr(w[i - 2], 17) ^ this._rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = this._rotr(e, 6) ^ this._rotr(e, 11) ^ this._rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
        const S0 = this._rotr(a, 2) ^ this._rotr(a, 13) ^ this._rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }

      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    const result = new Uint8Array(32);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, h0, false); rv.setUint32(4, h1, false);
    rv.setUint32(8, h2, false); rv.setUint32(12, h3, false);
    rv.setUint32(16, h4, false); rv.setUint32(20, h5, false);
    rv.setUint32(24, h6, false); rv.setUint32(28, h7, false);
    return result;
  }

  _rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  _padMessage(msg) {
    const len = msg.length;
    const bitLen = len * 8;
    const padLen = ((56 - (len + 1) % 64) + 64) % 64;
    const totalLen = len + 1 + padLen + 8;
    const padded = new Uint8Array(totalLen);
    padded.set(msg, 0);
    padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(totalLen - 4, bitLen, false);
    dv.setUint32(totalLen - 8, 0, false);
    return padded;
  }

  async imageRequest(model) {
    return async (input) => {
      const token = this.generateJwtToken();

      const formData = new FormData();
      formData.append("model", model.modelName);
      formData.append("prompt", input.prompt);

      if (input.n) {
        formData.append("n", String(input.n));
      }

      if (input.imageBase64 && input.imageBase64.length > 0) {
        const compressed = await zipImage(input.imageBase64[0], 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
        formData.append("image", blob, "image.jpg");
      }

      if (input.negativePrompt) {
        formData.append("negative_prompt", input.negativePrompt);
      }

      const response = await fetch(KLINGAI_API_URL + '/v1/images/generations', {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error("图片生成任务提交失败: " + error);
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        throw new Error("图片生成任务提交失败: 未返回任务ID");
      }

      const result = await pollTask(async () => {
        const queryToken = this.generateJwtToken();
        const queryRes = await fetch(KLINGAI_API_URL + '/v1/images/generations/' + taskId, {
          headers: { Authorization: "Bearer " + queryToken },
        });

        if (!queryRes.ok) return { completed: false };

        const queryData = await queryRes.json();
        const status = queryData.data?.task_status;

        if (status === "succeed") {
          const images = queryData.data?.task_result?.images;
          if (images && images.length > 0) {
            return { completed: true, data: images[0].url };
          }
          return { completed: true, error: "图片生成成功但未返回图片URL" };
        } else if (status === "failed") {
          return { completed: true, error: "图片生成失败: " + (queryData.data?.task_status_msg || "未知错误") };
        }
        return { completed: false };
      }, { interval: 3000, maxAttempts: 120 });

      if (result.error) throw new Error(result.error);
      return result.data;
    };
  }

  async videoRequest(model) {
    return async (input) => {
      const token = this.generateJwtToken();

      const formData = new FormData();
      formData.append("model", model.modelName);
      formData.append("prompt", input.prompt);

      if (input.duration) {
        formData.append("duration", String(input.duration));
      }

      if (input.firstImageBase64) {
        const compressed = await zipImage(input.firstImageBase64, 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
        formData.append("first_frame", blob, "first_frame.jpg");
      }

      if (input.lastImageBase64) {
        const compressed = await zipImage(input.lastImageBase64, 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
        formData.append("last_frame", blob, "last_frame.jpg");
      }

      if (input.referenceImages && input.referenceImages.length > 0) {
        for (let i = 0; i < input.referenceImages.length; i++) {
          const base64 = input.referenceImages[i];
          if (base64) {
            const compressed = await zipImage(base64, 5 * 1024 * 1024);
            const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
            formData.append("reference_images", blob, "reference_" + i + ".jpg");
          }
        }
      }

      const response = await fetch(KLINGAI_API_URL + '/v1/videos/generations', {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error("视频生成任务提交失败: " + error);
      }

      const data = await response.json();
      const taskId = data.data?.task_id || data.task_id;

      if (!taskId) {
        throw new Error("视频生成任务提交失败: 未返回任务ID");
      }

      const result = await pollTask(async () => {
        const queryToken = this.generateJwtToken();
        const queryRes = await fetch(KLINGAI_API_URL + '/v1/videos/generations/' + taskId, {
          headers: { Authorization: "Bearer " + queryToken },
        });

        if (!queryRes.ok) return { completed: false };

        const queryData = await queryRes.json();
        const status = queryData.data?.task_status;

        if (status === "succeed") {
          const videos = queryData.data?.task_result?.videos;
          if (videos && videos.length > 0) {
            return { completed: true, data: videos[0].url };
          }
          return { completed: true, error: "视频生成成功但未返回视频URL" };
        } else if (status === "failed") {
          return { completed: true, error: "视频生成失败: " + (queryData.data?.task_status_msg || "未知错误") };
        }
        return { completed: false };
      }, { interval: 5000, maxAttempts: 120 });

      if (result.error) throw new Error(result.error);
      return result.data;
    };
  }
}

module.exports = { Vendor };
