// ChatGPT Apps SDK 위젯 — MCP resource 로 제공되는 정적 HTML/JS. 1차 스코프는 "뷰어만,
// 편집 없음"(pan/zoom 만 가능): 노드/엣지/그룹을 SVG 로 그린다.
//
// whiteboard-web 의 실제 렌더러(Canvas.tsx, react-konva 기반)를 그대로 재사용하지 않는다 —
// 이 위젯은 ChatGPT 가 로드하는 샌드박스 iframe 안에서 빌드 단계 없이 도는 순수 HTML/JS라,
// React/Konva/Zustand 번들을 그대로 끌어올 수 없다(별도 번들링+호스팅 인프라가 필요해지는
// 더 큰 작업). 그래서 whiteboard-web 과 시각적으로 유사하게 보이도록 새로 작은 SVG 렌더러를
// 손으로 짰다 — 픽셀 단위로 동일하진 않지만 노드/엣지/그룹 구조는 정확히 같은 데이터를 쓴다.
//
// 데이터 소스는 OpenAI Apps SDK 의 window.openai.toolOutput (render_graph 가 반환한
// structuredContent) 이다. 이 계약(정확한 전역 객체 이름/이벤트)은 이 저장소에서 라이브 문서를
// fetch 할 수 없어(네트워크 egress 차단) 학습 시점 지식 기준으로 작성했다 — ChatGPT 에서 위젯이
// 비거나 데이터를 못 읽으면 이 파일의 getGraphData()/이벤트 리스너 부분부터 의심할 것.

export const WIDGET_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #f6f8fb; overflow: hidden;
                   font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      #status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
                color: #7c8aa5; font-size: 13px; text-align: center; padding: 16px; }
      svg { display: block; width: 100%; height: 100%; cursor: grab; }
      svg.dragging { cursor: grabbing; }
      .node-box { fill: #ffffff; stroke: #d7deea; stroke-width: 1.5; }
      .node-label { fill: #1f2937; font-size: 11px; text-anchor: middle; }
      .group-box { fill: rgba(93, 91, 239, 0.05); stroke: #5d5bef; stroke-width: 1.5; stroke-dasharray: 6 4; }
      .group-label { fill: #5d5bef; font-size: 11px; font-weight: 600; }
      .edge-line { stroke: #98a3b5; stroke-width: 1.5; fill: none; }
      .edge-label { fill: #6b7280; font-size: 10px; text-anchor: middle; }
    </style>
  </head>
  <body>
    <div id="status">Waiting for graph data…</div>
    <svg id="stage" xmlns="http://www.w3.org/2000/svg" style="display:none">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#98a3b5" />
        </marker>
      </defs>
      <g id="groups"></g>
      <g id="edges"></g>
      <g id="nodes"></g>
    </svg>
    <script>
      var NODE_W = 80, NODE_H = 100; // 아이콘(80) + 라벨 한 줄 대략치. whiteboard-web 과 동일하진 않음(1차 근사).

      function boxOf(node) {
        return { x: node.x, y: node.y, w: NODE_W, h: NODE_H, cx: node.x + NODE_W / 2, cy: node.y + NODE_H / 2 };
      }

      function anchorPoint(box, anchor) {
        switch (anchor) {
          case 'top': return { x: box.cx, y: box.y };
          case 'right': return { x: box.x + box.w, y: box.cy };
          case 'bottom': return { x: box.cx, y: box.y + box.h };
          case 'left': return { x: box.x, y: box.cy };
        }
        return null;
      }

      // anchor 가 없으면 상대 노드 방향으로 가장 가까운 변을 고른다.
      function nearestSide(box, towardX, towardY) {
        var dx = towardX - box.cx, dy = towardY - box.cy;
        if (Math.abs(dx) > Math.abs(dy)) return anchorPoint(box, dx >= 0 ? 'right' : 'left');
        return anchorPoint(box, dy >= 0 ? 'bottom' : 'top');
      }

      function el(tag, attrs, text) {
        var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (text != null) e.textContent = text;
        return e;
      }

      function truncate(text, max) {
        if (!text) return '';
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
      }

      function render(data) {
        var nodes = (data && data.nodes) || [];
        var edges = (data && data.edges) || [];
        var groups = (data && data.groups) || [];
        if (nodes.length === 0 && groups.length === 0) {
          document.getElementById('status').textContent = 'This graph is empty.';
          return;
        }
        document.getElementById('status').style.display = 'none';
        var svg = document.getElementById('stage');
        svg.style.display = 'block';

        var nodesById = {};
        nodes.forEach(function (n) { nodesById[n.id] = n; });

        var groupsG = document.getElementById('groups');
        var edgesG = document.getElementById('edges');
        var nodesG = document.getElementById('nodes');
        groupsG.innerHTML = '';
        edgesG.innerHTML = '';
        nodesG.innerHTML = '';

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function extend(x, y) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }

        groups.forEach(function (g) {
          groupsG.appendChild(el('rect', { class: 'group-box', x: g.x, y: g.y, width: g.width, height: g.height, rx: 8 }));
          if (g.label) groupsG.appendChild(el('text', { class: 'group-label', x: g.x + 10, y: g.y + 18 }, g.label));
          extend(g.x, g.y); extend(g.x + g.width, g.y + g.height);
        });

        edges.forEach(function (edge) {
          var from = nodesById[edge.from], to = nodesById[edge.to];
          if (!from || !to) return;
          var fromBox = boxOf(from), toBox = boxOf(to);
          var p1 = anchorPoint(fromBox, edge.fromAnchor) || nearestSide(fromBox, toBox.cx, toBox.cy);
          var p2 = anchorPoint(toBox, edge.toAnchor) || nearestSide(toBox, fromBox.cx, fromBox.cy);
          var dash = edge.style === 'dashed' ? '6 4' : edge.style === 'dotted' ? '2 3' : null;
          var markerStart = edge.direction === 'backward' || edge.direction === 'both' ? 'url(#arrow)' : null;
          var markerEnd = edge.direction === 'forward' || edge.direction === 'both' ? 'url(#arrow)' : null;
          var line = el('line', { class: 'edge-line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
          if (dash) line.setAttribute('stroke-dasharray', dash);
          if (markerStart) line.setAttribute('marker-start', markerStart);
          if (markerEnd) line.setAttribute('marker-end', markerEnd);
          edgesG.appendChild(line);
          if (edge.label) {
            edgesG.appendChild(el('text', { class: 'edge-label', x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 4 }, edge.label));
          }
        });

        nodes.forEach(function (node) {
          var box = boxOf(node);
          nodesG.appendChild(el('rect', { class: 'node-box', x: box.x, y: box.y, width: box.w, height: 56, rx: 10 }));
          nodesG.appendChild(el('text', {
            class: 'node-label', x: box.cx, y: box.y + 56 + 16,
          }, truncate(node.label || node.type, 22)));
          extend(box.x, box.y); extend(box.x + box.w, box.y + box.h);
        });

        var pad = 40;
        var w = Math.max(100, maxX - minX + pad * 2);
        var h = Math.max(100, maxY - minY + pad * 2);
        svg.setAttribute('viewBox', (minX - pad) + ' ' + (minY - pad) + ' ' + w + ' ' + h);
      }

      // ── pan/zoom (읽기 전용 — 노드 드래그/생성/삭제 없음) ──
      (function setupPanZoom() {
        var svg = document.getElementById('stage');
        var viewBox = null;
        function parseViewBox() {
          var parts = (svg.getAttribute('viewBox') || '0 0 100 100').split(' ').map(Number);
          return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
        }
        var dragging = false, lastX = 0, lastY = 0;
        svg.addEventListener('pointerdown', function (e) {
          dragging = true; lastX = e.clientX; lastY = e.clientY;
          svg.classList.add('dragging');
          svg.setPointerCapture(e.pointerId);
        });
        svg.addEventListener('pointermove', function (e) {
          if (!dragging) return;
          viewBox = parseViewBox();
          var scale = viewBox.w / svg.clientWidth;
          viewBox.x -= (e.clientX - lastX) * scale;
          viewBox.y -= (e.clientY - lastY) * scale;
          lastX = e.clientX; lastY = e.clientY;
          svg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.w + ' ' + viewBox.h);
        });
        svg.addEventListener('pointerup', function () { dragging = false; svg.classList.remove('dragging'); });
        svg.addEventListener('wheel', function (e) {
          e.preventDefault();
          viewBox = parseViewBox();
          var factor = e.deltaY > 0 ? 1.1 : 0.9;
          var newW = viewBox.w * factor, newH = viewBox.h * factor;
          viewBox.x -= (newW - viewBox.w) / 2;
          viewBox.y -= (newH - viewBox.h) / 2;
          svg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + newW + ' ' + newH);
        }, { passive: false });
      })();

      // ── ChatGPT Apps SDK 로부터 데이터 읽기 ──
      // window.openai.toolOutput 이 render_graph 가 돌려준 structuredContent 다. 로드 순서
      // 경쟁을 피하려고 잠깐 재시도하고, 이후 갱신은 openai:set_globals 이벤트로 받는다.
      function getGlobals() {
        return (window.openai && window.openai.toolOutput) || null;
      }
      var attempts = 0;
      var poll = setInterval(function () {
        var data = getGlobals();
        if (data) { clearInterval(poll); render(data); }
        else if (++attempts > 40) { clearInterval(poll); document.getElementById('status').textContent = 'No graph data received from ChatGPT.'; }
      }, 100);
      window.addEventListener('openai:set_globals', function (event) {
        var data = (event.detail && event.detail.globals && event.detail.globals.toolOutput) || getGlobals();
        if (data) render(data);
      });
    </script>
  </body>
</html>`
