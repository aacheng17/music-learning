(function () {
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  var DOS_TIME = 0x0000, DOS_DATE = 0x0021;

  function makeZipBlob(files) {
    var parts = [], centralParts = [], offset = 0, centralDirLength = 0;
    var encoder = new TextEncoder();

    for (var fi = 0; fi < files.length; fi++) {
      var f = files[fi];
      var nameBuf = encoder.encode(f.name);
      var crc = crc32(f.data);
      var size = f.data.length;

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, DOS_TIME, true);
      local.setUint16(12, DOS_DATE, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, nameBuf.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), nameBuf, f.data);

      var central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, DOS_TIME, true);
      central.setUint16(14, DOS_DATE, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, size, true);
      central.setUint32(24, size, true);
      central.setUint16(28, nameBuf.length, true);
      central.setUint16(30, 0, true);
      central.setUint16(32, 0, true);
      central.setUint16(34, 0, true);
      central.setUint16(36, 0, true);
      central.setUint32(38, (0o100644 << 16) >>> 0, true);
      central.setUint32(42, offset, true);
      centralParts.push(new Uint8Array(central.buffer), nameBuf);
      centralDirLength += 46 + nameBuf.length;

      offset += 30 + nameBuf.length + f.data.length;
    }

    var centralDirStart = offset;
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralDirLength, true);
    end.setUint32(16, centralDirStart, true);
    end.setUint16(20, 0, true);

    var allParts = parts.concat(centralParts, [new Uint8Array(end.buffer)]);
    return new Blob(allParts, { type: 'application/zip' });
  }

  function slugify(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  }

  function svgDimensions(svg) {
    var wm = /width="([\d.]+)"/.exec(svg);
    var hm = /height="([\d.]+)"/.exec(svg);
    return { w: wm ? parseFloat(wm[1]) : 300, h: hm ? parseFloat(hm[1]) : 300 };
  }

  function svgToPngBytes(svg, scale) {
    return new Promise(function (resolve, reject) {
      var dims = svgDimensions(svg);
      var blob = new Blob([svg], { type: 'image/svg+xml' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(dims.w * scale));
        canvas.height = Math.max(1, Math.round(dims.h * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (pngBlob) {
          if (!pngBlob) { reject(new Error('PNG conversion failed')); return; }
          pngBlob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); });
        }, 'image/png');
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not render SVG'));
      };
      img.src = url;
    });
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var modal = document.getElementById('dl-modal');
  if (!modal) return;

  var titleEl = document.getElementById('dl-modal-title');
  var kindEl = modal.querySelector('.dl-modal-kind');
  var listEl = modal.querySelector('.dl-modal-list');
  var confirmBtn = modal.querySelector('.dl-modal-confirm');
  var cancelBtn = modal.querySelector('.dl-modal-cancel');
  var formatInputs = modal.querySelectorAll('input[name="dl-format"]');

  var currentImages = [];
  var currentLabel = '';

  function openModal(images, label) {
    currentImages = images;
    currentLabel = label;
    titleEl.textContent = label;
    kindEl.textContent = images.length > 1
      ? ('Downloading ' + images.length + ' images as a .zip')
      : 'Downloading 1 image';
    listEl.innerHTML = '';
    images.forEach(function (img) {
      var li = document.createElement('li');
      li.textContent = img.title;
      listEl.appendChild(li);
    });
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
  }

  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  confirmBtn.addEventListener('click', function () {
    var format = 'svg';
    for (var i = 0; i < formatInputs.length; i++) if (formatInputs[i].checked) format = formatInputs[i].value;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Preparing…';

    var work = format === 'svg'
      ? Promise.resolve(currentImages.map(function (img) {
          return { name: slugify(img.title) + '.svg', data: new TextEncoder().encode(img.svg) };
        }))
      : Promise.all(currentImages.map(function (img) {
          return svgToPngBytes(img.svg, 3).then(function (bytes) {
            return { name: slugify(img.title) + '.png', data: bytes };
          });
        }));

    work.then(function (files) {
      if (files.length === 1) {
        var mime = format === 'svg' ? 'image/svg+xml' : 'image/png';
        triggerDownload(new Blob([files[0].data], { type: mime }), files[0].name);
      } else {
        triggerDownload(makeZipBlob(files), slugify(currentLabel) + '.zip');
      }
    }).catch(function (err) {
      alert('Download failed: ' + err.message);
    }).then(function () {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Download';
      closeModal();
    });
  });

  var buttons = document.querySelectorAll('.download[data-images]');
  for (var bi = 0; bi < buttons.length; bi++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var dataId = btn.getAttribute('data-images');
        var dataEl = document.getElementById(dataId);
        if (!dataEl) return;
        var images = JSON.parse(dataEl.textContent);
        openModal(images, btn.getAttribute('data-label') || '');
      });
    })(buttons[bi]);
  }
})();
