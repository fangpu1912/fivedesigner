#!/usr/bin/env python3
"""
豆包无水印下载测试脚本 - Phase 2A
用法: 先用浏览器登录doubao.com, 然后在控制台执行:
  document.cookie
把cookie字符串粘贴到本脚本的COOKIE变量
"""
import requests
import json
import re
import uuid

COOKIE = ""  # 贴你的doubao.com cookie

THREAD_URL = "https://www.doubao.com/thread/x5330c5856b7081fe94352b8b7c9eb574"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

def fetch_thread(url):
    """Step 1: 获取线程页面，提取 _ROUTER_DATA"""
    resp = requests.get(url, headers=HEADERS, cookies=_parse_cookies(COOKIE))
    html = resp.text
    
    # 方法1: 从 _ROUTER_DATA 提取
    match = re.search(r'window\._ROUTER_DATA\s*=\s*(\{.*?\});\s*</script>', html, re.DOTALL)
    if match:
        data = json.loads(match.group(1))
        return data
    
    # 方法2: 从 data-fn-args 提取
    match = re.search(r'data-fn-args="(.*?)"\s*nonce="', html, re.DOTALL)
    if match:
        import html as html_mod
        decoded = html_mod.unescape(match.group(1))
        data = json.loads(decoded)
        return data
    
    print("未找到 _ROUTER_DATA")
    return None

def find_videos(data):
    """Step 2: 递归搜索 vid 和 message_id"""
    videos = []
    
    def search(obj, depth=0):
        if depth > 15 or not obj:
            return
        if isinstance(obj, list):
            for item in obj:
                search(item, depth+1)
        elif isinstance(obj, dict):
            vid = obj.get("vid") or obj.get("video_id", "")
            if isinstance(vid, str) and vid.startswith("v0"):
                msg_id = str(obj.get("message_id", "")).strip()
                if msg_id and msg_id != "0":
                    videos.append({"vid": vid, "messageId": msg_id})
                    return  # 找到就跳过这个分支的深入搜索
            
            # 特别检查 content_v2 (JSON字符串)
            if "content_v2" in obj and isinstance(obj["content_v2"], str):
                try:
                    search(json.loads(obj["content_v2"]), depth+1)
                except:
                    pass
            
            for val in obj.values():
                search(val, depth+1)
    
    search(data, 0)
    return videos

def get_play_info(vid):
    """Step 3: 调用 get_play_info API"""
    url = "https://www.doubao.com/samantha/media/get_play_info"
    params = {
        "aid": "497858",
        "device_platform": "web",
        "samantha_web": "1",
        "use-olympus-account": "1",
        "version_code": "20800",
        "pkg_type": "release_version",
        "web_tab_id": str(uuid.uuid4())
    }
    
    resp = requests.post(
        url,
        params=params,
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "agw-js-conv": "str",
            "origin": "https://www.doubao.com",
            "referer": "https://www.doubao.com/"
        },
        cookies=_parse_cookies(COOKIE),
        json={"key": vid, "type": "video"}
    )
    
    data = resp.json()
    if data.get("code") != 0:
        print(f"API错误: code={data.get('code')}, msg={data.get('msg')}")
        return None
    
    d = data.get("data", {})
    print(f"\nAPI响应顶层字段: {list(d.keys())}")
    
    # Phase 2A: original_media_info (无水印原始视频)
    om = d.get("original_media_info")
    if om:
        print(f"\n✅ original_media_info 存在!")
        print(f"  main_url: {om.get('main_url', '')[:150]}")
        print(f"  definition: {om.get('definition')}")
        print(f"  width: {om.get('width')}, height: {om.get('height')}")
        return {"url": om["main_url"], "source": "original"}
    
    # 回退: play_infos
    pi = (d.get("play_infos") or [None])[0] or d.get("play_info")
    if pi and pi.get("main"):
        url = pi["main"]
        # Phase 2B: 尝试lr替换
        no_wm = re.sub(r'lr=[^&]+', 'lr=video_gen_no_watermark', url)
        print(f"\n❌ original_media_info 不存在")
        print(f"play_infos main: {url[:150]}")
        print(f"play_infos 去水印: {no_wm[:150]}")
        return {"url": no_wm, "source": "play_info_fallback"}
    
    print("未找到视频URL")
    return None

def _parse_cookies(cookie_str):
    """解析cookie字符串"""
    if not cookie_str:
        return {}
    cookies = {}
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies

if __name__ == "__main__":
    if not COOKIE:
        print("=" * 60)
        print("请先在浏览器登录 doubao.com")
        print("然后在控制台执行: document.cookie")
        print("粘贴结果到本脚本的 COOKIE = '' 变量")
        print("=" * 60)
        exit(1)
    
    print("=== 豆包无水印下载测试 ===")
    print(f"线程URL: {THREAD_URL}\n")
    
    # Step 1: 获取页面数据
    print("[1/3] 获取页面数据...")
    data = fetch_thread(THREAD_URL)
    if not data:
        exit(1)
    
    # Step 2: 搜索视频
    print("[2/3] 搜索视频...")
    videos = find_videos(data)
    print(f"找到 {len(videos)} 个视频:")
    for v in videos:
        print(f"  vid={v['vid']}, messageId={v['messageId']}")
    
    if not videos:
        exit(1)
    
    # Step 3: 获取播放信息
    print(f"\n[3/3] 获取第1个视频的播放信息...")
    result = get_play_info(videos[0]["vid"])
    
    if result:
        print(f"\n{'='*60}")
        print(f"下载URL: {result['url']}")
        print(f"来源: {result['source']}")
        print(f"{'='*60}")
        print("\n复制上面的URL到浏览器新标签页打开，看是否有水印")
