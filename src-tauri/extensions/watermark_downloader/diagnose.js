// 豆包无水印诊断 v5 - 完整 API 测试
// 使用方法：在有视频的豆包对话页面控制台执行
(function() {
  console.log('=== 豆包无水印诊断 v5 ===');
  
  // === Step 1: 获取消息列表 ===
  const routerData = window._ROUTER_DATA;
  if (!routerData) { console.error('未找到 _ROUTER_DATA'); return; }
  
  const chatLayout = routerData.loaderData?.chat_layout;
  if (!chatLayout) { console.error('未找到 chat_layout'); return; }
  
  let messageList = [];
  // 新版结构
  for (const key of Object.keys(chatLayout)) {
    if (key.includes('/page') || key.includes('messageList')) {
      const pageData = chatLayout[key];
      const ml = pageData?.messageList?.message_list || pageData?.message_list;
      if (Array.isArray(ml) && ml.length > 0) { messageList = ml; break; }
    }
  }
  // 旧版结构
  if (!messageList.length) {
    const cells = chatLayout.trimmedChainRecentConvCells || [];
    for (const cell of cells) {
      messageList.push(...(cell?.conversation?.messages || []));
    }
  }
  
  console.log(`消息数量: ${messageList.length}`);
  
  // === Step 2: 搜索所有 vid ===
  const videoEntries = [];
  function findVid(obj, path = '', depth = 0) {
    if (depth > 15 || !obj) return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => findVid(item, `${path}[${i}]`, depth + 1));
    } else if (typeof obj === 'object') {
      if (obj.vid && typeof obj.vid === 'string' && obj.vid.startsWith('v0')) {
        videoEntries.push({ vid: obj.vid, path, msgId: obj.message_id });
      }
      for (const k of Object.keys(obj).slice(0, 30)) {
        findVid(obj[k], `${path}.${k}`, depth + 1);
      }
    }
  }
  
  for (const msg of messageList) {
    findVid(msg, 'msg');
  }
  
  console.log(`\n找到 ${videoEntries.length} 个 vid:`);
  videoEntries.forEach((v, i) => console.log(`  ${i+1}. vid=${v.vid}, path=${v.path}`));
  
  // 从 SSE videoCache 中也找
  // (videoCache 是 content.js 里的变量，这里无法直接访问)
  
  if (!videoEntries.length) {
    console.warn('\n⚠️ _ROUTER_DATA 中没有找到 vid！');
    console.log('可能原因：1) 此对话没有视频  2) 视频通过 SSE 动态加载，不在初始数据中');
    console.log('请在 AI 生成视频后，点击扩展的下载按钮测试');
    console.log('同时检查 SSE 是否拦截到了视频数据：');
    console.log('  在控制台搜索 [content.js] 或 videoDataExtracted 相关日志');
  }
  
  // === Step 3: 如果有 vid，测试 API ===
  if (videoEntries.length > 0) {
    const testVid = videoEntries[0].vid;
    console.log(`\n=== 测试 API (vid=${testVid}) ===`);
    
    // 3a. get_play_info
    console.log('\n--- get_play_info ---');
    try {
      const params = new URLSearchParams({
        aid: '497858', device_platform: 'web', samantha_web: '1',
        'use-olympus-account': '1', version_code: '20800',
        pkg_type: 'release_version', web_tab_id: crypto.randomUUID()
      });
      const resp = await fetch(`https://www.doubao.com/samantha/media/get_play_info?${params}`, {
        method: 'POST',
        headers: {
          'accept': 'application/json', 'content-type': 'application/json',
          'agw-js-conv': 'str', 'origin': location.origin, 'referer': location.href
        },
        credentials: 'include',
        body: JSON.stringify({ key: testVid, type: 'video' })
      });
      const json = await resp.json();
      console.log('code:', json.code);
      
      if (json.code === 0 && json.data) {
        const d = json.data;
        console.log('data 顶层字段:', Object.keys(d));
        
        // original_media_info
        if (d.original_media_info) {
          const om = d.original_media_info;
          console.log('\n✅ original_media_info 存在!');
          console.log('  main_url:', om.main_url?.substring(0, 150));
          console.log('  definition:', om.definition);
          console.log('  width:', om.width, 'height:', om.height);
          
          // 检查 URL 参数
          try {
            const urlObj = new URL(om.main_url);
            console.log('  URL参数:');
            for (const [k, v] of urlObj.searchParams) {
              if (k === 'lr' || k === 'sign' || k === 'x-expires') {
                console.log(`    ${k} = ${v.substring(0, 60)}${v.length > 60 ? '...' : ''}`);
              }
            }
            const lr = urlObj.searchParams.get('lr');
            console.log(`  >>> lr 参数: ${lr || '(不存在)'}`);
            if (!lr) {
              console.log('  >>> 没有 lr 参数，说明是原始无水印视频！直接下载即可');
            } else if (lr.includes('no_watermark')) {
              console.log('  >>> lr=video_gen_no_watermark，API 直接返回了无水印URL！');
            } else if (lr.includes('watermark')) {
              console.log('  >>> lr 包含 watermark，但修改会破坏签名');
            }
          } catch(e) {}
        } else {
          console.log('❌ original_media_info 不存在');
        }
        
        // play_infos
        const playInfos = d.play_infos || (d.play_info ? [d.play_info] : []);
        if (playInfos.length > 0) {
          const pi = playInfos[0];
          console.log('\nplay_infos[0]:');
          console.log('  main:', pi.main?.substring(0, 150));
          console.log('  definition:', pi.definition);
          console.log('  width:', pi.width, 'height:', pi.height);
          
          try {
            const urlObj = new URL(pi.main);
            const lr = urlObj.searchParams.get('lr');
            console.log(`  lr 参数: ${lr || '(不存在)'}`);
          } catch(e) {}
        }
      }
    } catch(e) {
      console.error('get_play_info 失败:', e);
    }
    
    // 3b. share 流程
    console.log('\n--- share 流程 ---');
    const testMsgId = videoEntries[0].msgId || String(messageList.find(m => {
      return findVidSimple(m) === testVid;
    })?.message_id || '').trim();
    
    function findVidSimple(obj, depth = 0) {
      if (depth > 10 || !obj) return null;
      if (obj.vid?.startsWith('v0')) return obj.vid;
      if (Array.isArray(obj)) { for (const i of obj) { const f = findVidSimple(i, depth+1); if (f) return f; } }
      else if (typeof obj === 'object') { for (const v of Object.values(obj)) { const f = findVidSimple(v, depth+1); if (f) return f; } }
      return null;
    }
    
    // 找到对应 messageId
    let foundMsgId = '';
    for (const msg of messageList) {
      const vid = findVidSimple(msg);
      if (vid === testVid) {
        foundMsgId = String(msg.message_id || '').trim();
        break;
      }
    }
    
    if (foundMsgId) {
      console.log('messageId:', foundMsgId);
      try {
        // share_save
        const resp1 = await fetch('https://api-normal.doubao.com/alice/media/bigmusic/share_save?version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7550681679050343936&pc_version=3.14.6&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message_id: foundMsgId })
        });
        const json1 = await resp1.json();
        console.log('share_save code:', json1.code);
        
        if (json1.code === 0 && json1.data?.share_id) {
          const shareId = json1.data.share_id;
          
          // get_video_share_info
          const resp2 = await fetch('https://www.doubao.com/creativity/share/get_video_share_info?version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7550681679050343936&pc_version=3.14.6&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1&web_tab_id=' + crypto.randomUUID(), {
            method: 'POST',
            headers: { 'accept': 'application/json', 'content-type': 'application/json', 'agw-js-conv': 'str' },
            credentials: 'include',
            body: JSON.stringify({ share_id: shareId, vid: testVid, creation_id: '' })
          });
          const json2 = await resp2.json();
          console.log('get_video_share_info code:', json2.code);
          
          if (json2.code === 0 && json2.data) {
            const d = json2.data;
            console.log('share data 字段:', Object.keys(d));
            
            if (d.original_media_info) {
              console.log('✅ share 返回了 original_media_info!');
              console.log('  main_url:', d.original_media_info.main_url?.substring(0, 150));
            }
            
            const pi = d.play_infos?.[0] || d.play_info;
            if (pi) {
              console.log('share play_infos:');
              console.log('  main:', pi.main?.substring(0, 150));
              try {
                const urlObj = new URL(pi.main);
                const lr = urlObj.searchParams.get('lr');
                console.log(`  lr 参数: ${lr || '(不存在)'}`);
              } catch(e) {}
            }
          }
        }
      } catch(e) {
        console.error('share 流程失败:', e);
      }
    } else {
      console.log('未找到对应 messageId');
    }
  }
  
  // === Step 4: 检查 SSE videoCache ===
  console.log('\n=== 检查 SSE 动态视频 ===');
  console.log('如果你已经生成了视频但 _ROUTER_DATA 中没有找到，');
  console.log('请检查扩展的 content.js 是否拦截到了 SSE 中的视频数据。');
  console.log('在控制台搜索 "[content.js]" 或 "videoDataExtracted" 查看日志。');
  
  console.log('\n=== 诊断完成 ===');
})();
