/**
 * 3D Bee — Three.js
 * 极简卡通蜜蜂自主飞行
 */
(function () {
  'use strict';

  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isMobile || reduceMotion) return;
  if (typeof THREE === 'undefined') return;

  /* ========== 全局状态 ========== */
  var renderer, scene, camera, bee, beeWings = [];
  var clock, canvas;
  var active = false;

  var beeVelocity = new THREE.Vector3();
  var wanderTarget = new THREE.Vector3();
  var wanderTimer = 0;
  var noiseOffset = Math.random() * 1000;

  /* 蜜蜂临时目标（点击文字时飞过去） */
  var beeState = 'wander'; /* wander | curious | return */
  var curiousTarget = new THREE.Vector3();
  var curiousTimer = 0;

  /* ========== 初始化 ========== */
  function initThree() {
    canvas = document.createElement('canvas');
    canvas.id = 'bee3dCanvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
    document.body.appendChild(canvas);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 0, 500);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var dirLight = new THREE.DirectionalLight(0xfff8e1, 0.45);
    dirLight.position.set(200, 300, 400);
    scene.add(dirLight);
    var fillLight = new THREE.DirectionalLight(0xe1f5fe, 0.3);
    fillLight.position.set(-200, -50, 300);
    scene.add(fillLight);

    clock = new THREE.Clock();

    bee = createBee();
    var startPos = screenToWorld(window.innerWidth * 0.3, window.innerHeight * 0.4);
    bee.position.copy(startPos);
    scene.add(bee);

    pickNewWanderTarget();
    window.addEventListener('resize', onResize);
    animate();
  }

  function screenToWorld(sx, sy) {
    var vec = new THREE.Vector3();
    vec.x = (sx / window.innerWidth) * 2 - 1;
    vec.y = -(sy / window.innerHeight) * 2 + 1;
    vec.z = 0.5;
    vec.unproject(camera);
    var dir = vec.sub(camera.position).normalize();
    var dist = -camera.position.z / dir.z;
    return camera.position.clone().add(dir.multiplyScalar(dist));
  }

  /* ========== 蜜蜂模型（极简卡通版） ========== */
  function createBee() {
    var g = new THREE.Group();

    /* 身体 — 单个胖椭球 */
    var bodyGeo = new THREE.SphereGeometry(20, 24, 20);
    bodyGeo.scale(1.5, 1, 1);
    var bodyMat = new THREE.MeshPhongMaterial({ color: 0xFFD600, shininess: 80 });
    g.add(new THREE.Mesh(bodyGeo, bodyMat));

    /* 两道黑色条纹 */
    var stripeMat = new THREE.MeshPhongMaterial({ color: 0x1A1A1A });
    for (var i = 0; i < 2; i++) {
      var sg = new THREE.TorusGeometry(15, 3.5, 8, 24);
      sg.rotateY(Math.PI / 2);
      var s = new THREE.Mesh(sg, stripeMat);
      s.position.x = -2 + i * 14;
      s.scale.set(1, 1.15, 1);
      g.add(s);
    }

    /* 眼睛 — 两个黑点 */
    var eyeGeo = new THREE.SphereGeometry(3, 10, 8);
    var eyeMat = new THREE.MeshPhongMaterial({ color: 0x000000, shininess: 100 });
    var eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(26, 5, 6);
    g.add(eyeL);
    var eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(26, 5, -6);
    g.add(eyeR);

    /* 翅膀 — 两个半透明白色水滴形 */
    var wingGeo = new THREE.SphereGeometry(13, 12, 10);
    wingGeo.scale(1, 0.18, 0.6);
    var wingMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, shininess: 100
    });
    var wingL = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(8, 14, 7);
    wingL.rotation.z = -0.2;
    g.add(wingL);
    beeWings.push(wingL);

    var wingR = new THREE.Mesh(wingGeo, wingMat.clone());
    wingR.position.set(8, 14, -7);
    wingR.rotation.z = -0.2;
    g.add(wingR);
    beeWings.push(wingR);

    g.scale.setScalar(0.75);
    return g;
  }

  /* ========== 飞行 AI ========== */
  function pickNewWanderTarget() {
    var margin = 80;
    var sx = margin + Math.random() * (window.innerWidth - margin * 2);
    var sy = margin + Math.random() * (window.innerHeight - margin * 2);
    wanderTarget.copy(screenToWorld(sx, sy));
    wanderTimer = 2.5 + Math.random() * 3;
  }

  function smoothLerp(current, target, factor, dt) {
    var t = 1 - Math.pow(1 - factor, dt * 60);
    return current + (target - current) * t;
  }

  function updateBee(dt) {
    var target;
    var speed = 3;

    if (beeState === 'curious') {
      target = curiousTarget;
      speed = 5;
      curiousTimer -= dt;
      if (curiousTimer <= 0 || bee.position.distanceTo(curiousTarget) < 40) {
        beeState = 'wander';
        pickNewWanderTarget();
      }
    } else if (beeState === 'return') {
      target = wanderTarget;
      wanderTimer -= dt;
      if (wanderTimer <= 0 || bee.position.distanceTo(wanderTarget) < 30) {
        pickNewWanderTarget();
      }
    } else {
      target = wanderTarget;
      wanderTimer -= dt;
      if (wanderTimer <= 0 || bee.position.distanceTo(wanderTarget) < 30) {
        pickNewWanderTarget();
      }
    }

    /* 噪声扰动 — 自然飘忽 */
    var t = clock.getElapsedTime() + noiseOffset;
    var noiseY = Math.sin(t * 2.5) * 0.5;
    var noiseZ = Math.cos(t * 2) * 0.3;

    /* 丝滑移动 */
    var dir = new THREE.Vector3().subVectors(target, bee.position);
    if (dir.length() > 0.1) {
      dir.normalize().multiplyScalar(speed);
      beeVelocity.x = smoothLerp(beeVelocity.x, dir.x, 0.05, dt);
      beeVelocity.y = smoothLerp(beeVelocity.y, dir.y + noiseY, 0.05, dt);
      beeVelocity.z = smoothLerp(beeVelocity.z, dir.z + noiseZ, 0.05, dt);
    }
    bee.position.add(beeVelocity.clone().multiplyScalar(dt * 60));

    /* 丝滑朝向 — 四元数 slerp */
    if (beeVelocity.length() > 0.3) {
      var lookTarget = new THREE.Vector3().addVectors(bee.position, beeVelocity);
      var dummy = new THREE.Object3D();
      dummy.position.copy(bee.position);
      dummy.lookAt(lookTarget);
      dummy.rotateY(Math.PI / 2);
      bee.quaternion.slerp(dummy.quaternion, 1 - Math.pow(0.82, dt * 60));
    }

    /* 翅膀拍打 — 正弦波 */
    var flapPhase = clock.getElapsedTime() * 35;
    for (var i = 0; i < beeWings.length; i++) {
      var w = beeWings[i];
      var flap = (Math.sin(flapPhase) + 1) * 0.5;
      w.scale.y = 0.2 + flap * 0.8;
      w.material.opacity = 0.3 + flap * 0.3;
      w.rotation.x = (i === 0 ? 1 : -1) * flap * 0.45;
    }
  }

  /* ========== 文字翻转交互 ========== */
  var FLIP_EASE = 'cubic-bezier(0.68, -0.15, 0.27, 1.15)';
  var FLIP_DUR = 400; /* ms */

  function setupTextInteraction() {
    var lines = document.querySelectorAll('.hd-clickable');
    lines.forEach(function (line) {
      var flipText = line.getAttribute('data-flip-text');
      if (!flipText) return;

      line.style.cursor = 'pointer';
      line.style.transition = 'transform ' + (FLIP_DUR / 1000) + 's ' + FLIP_EASE;
      line.style.transformStyle = 'preserve-3d';

      line.addEventListener('mouseenter', function () {
        if (!line.classList.contains('flipping') && !line.classList.contains('flipped')) {
          line.style.transform = 'perspective(800px) rotateY(12deg) scale(1.03)';
        }
      });
      line.addEventListener('mouseleave', function () {
        if (!line.classList.contains('flipping') && !line.classList.contains('flipped')) {
          line.style.transform = 'perspective(800px) rotateY(0deg) scale(1)';
        }
      });

      line.addEventListener('click', function (e) {
        if (line.classList.contains('flipping') || line.classList.contains('flipped')) return;
        e.preventDefault();
        e.stopPropagation();

        /* 蜜蜂飞向文字位置 */
        var rect = line.getBoundingClientRect();
        var sx = rect.left + rect.width / 2;
        var sy = rect.top + rect.height / 2;
        curiousTarget.copy(screenToWorld(sx, sy));
        beeState = 'curious';
        curiousTimer = 2.5;

        /* 翻转文字 */
        flipText(line, flipText);

        /* 3秒后自动翻回 */
        setTimeout(function () {
          flipTextBack(line);
        }, 3000);
      });
    });
  }

  function flipText(element, newText) {
    if (element.classList.contains('flipping')) return;
    element.classList.add('flipping');

    element.style.transition = 'transform ' + (FLIP_DUR / 1000) + 's ' + FLIP_EASE;
    element.style.transform = 'perspective(800px) rotateY(90deg) scale(0.95)';

    setTimeout(function () {
      element.textContent = newText;
      element.classList.add('flipped');
      void element.offsetWidth;
      element.style.transform = 'perspective(800px) rotateY(180deg) scale(0.95)';
      void element.offsetWidth;
      element.style.transform = 'perspective(800px) rotateY(360deg) scale(1)';

      setTimeout(function () {
        element.classList.remove('flipping');
        element.style.transform = 'perspective(800px) rotateY(0deg) scale(1)';
      }, FLIP_DUR);
    }, FLIP_DUR);
  }

  function flipTextBack(element) {
    if (element.classList.contains('flipping')) return;
    if (!element.classList.contains('flipped')) return;
    element.classList.add('flipping');

    element.style.transition = 'transform ' + (FLIP_DUR / 1000) + 's ' + FLIP_EASE;
    element.style.transform = 'perspective(800px) rotateY(90deg) scale(0.95)';

    setTimeout(function () {
      element.innerHTML = element.getAttribute('data-original-html');
      element.classList.remove('flipped');
      void element.offsetWidth;
      element.style.transform = 'perspective(800px) rotateY(0deg) scale(1)';

      setTimeout(function () {
        element.classList.remove('flipping');
      }, FLIP_DUR);
    }, FLIP_DUR);
  }

  /* ========== 渲染循环 ========== */
  /* 蜜蜂是全屏常驻装饰，滚动时用户期望它照常飞动，故不做「滚动暂停渲染」
     （那样会造成明显的静止/跳变感）。仅当标签页不可见时彻底停渲染，省电且无感知。 */
  var paused = false;
  function animate() {
    requestAnimationFrame(animate);
    if (!active || paused) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    updateBee(dt);
    renderer.render(scene, camera);
  }

  /* 标签页不可见时彻底停渲染，省电省 CPU；恢复时丢弃累积 dt，避免突变 */
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
    if (!paused) clock.getDelta();
  });

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ========== 启动 ========== */
  function start() {
    initThree();
    setupTextInteraction();

    /* 保存原始HTML用于翻转恢复 */
    document.querySelectorAll('.hd-clickable').forEach(function (el) {
      el.setAttribute('data-original-html', el.innerHTML);
    });

    var preloader = document.querySelector('.preloader');
    if (preloader) {
      var obs = new MutationObserver(function () {
        if (preloader.classList.contains('done') || !preloader.parentNode) {
          active = true;
          obs.disconnect();
        }
      });
      obs.observe(preloader, { attributes: true, childList: true, subtree: true });
      setTimeout(function () { active = true; }, 5000);
    } else {
      active = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
