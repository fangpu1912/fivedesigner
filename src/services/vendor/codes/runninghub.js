const RH_BASE_URL = "https://www.runninghub.cn";

class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || RH_BASE_URL;
  }

  async _request(path, body, method) {
    const url = this.baseUrl + path;
    const options = {
      method: method || "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.apiKey,
      },
    };
    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      throw new Error("RunningHub API错误: " + (data.msg || data.message || JSON.stringify(data)));
    }
    return data;
  }

  async submitTask(params) {
    const body = {
      webappId: params.webappId,
      nodeInfoList: params.nodeInfoList || [],
    };
    if (params.runCount) body.runCount = params.runCount;
    return this._request("/task/openapi/ai-app/run", body);
  }

  async queryTask(taskId) {
    return this._request("/task/openapi/outputs", { taskId: taskId });
  }

  async getAppInfo(webappId) {
    return this._request("/api/webapp/apiCallDemo", { webappId: webappId });
  }

  async uploadAsset(fileData) {
    const url = this.baseUrl + "/task/openapi/upload";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.apiKey,
      },
      body: fileData,
    });
    const data = await response.json();
    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      throw new Error("上传失败: " + (data.msg || data.message || JSON.stringify(data)));
    }
    return data;
  }

  async imageRequest(model) {
    return async (params) => {
      const result = await this.submitTask({
        webappId: model.modelName,
        nodeInfoList: params.nodeInfoList || [],
      });
      if (!result.data?.taskId) {
        throw new Error("提交任务失败: " + JSON.stringify(result));
      }
      return { taskId: result.data.taskId, type: "runninghub" };
    };
  }

  async videoRequest(model) {
    return async (params) => {
      const result = await this.submitTask({
        webappId: model.modelName,
        nodeInfoList: params.nodeInfoList || [],
      });
      if (!result.data?.taskId) {
        throw new Error("提交任务失败: " + JSON.stringify(result));
      }
      return { taskId: result.data.taskId, type: "runninghub" };
    };
  }
}

module.exports = { Vendor };
