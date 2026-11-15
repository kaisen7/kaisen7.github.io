/* =========================================================
   kaisen7 — main.js
   Organização:
   1. Configurações e estado
   2. Funções auxiliares
   3. Layout do teclado (inspirado no Redragon Kumara Pro K552 RGB)
   4. Interface (título, cores de fundo, rolagem, textos)
   5. Cena 3D (renderizador, materiais, teclas, luz RGB)
   6. Arrumações das teclas (uma por seção)
   7. Loop de animação
   8. Introdução e início de tudo
   ========================================================= */

/*
  POR QUE ESTE ARQUIVO NÃO É UM "MÓDULO":
  Se o main.js fosse <script type="module">, o navegador se recusaria a rodá-lo
  quando você abre o index.html com dois cliques (endereço file://).
  Então ele é um script normal, e o Three.js é carregado com import() lá embaixo,
  na função carregarThree(). Assim funciona com dois cliques, no Live Server e no GitHub Pages.

  Tudo fica dentro deste (() => { ... })() para as variáveis não "vazarem" para a página.
*/
(() => {

// Preenchidos em carregarThree()
let THREE;
let RoundedBoxGeometry;
let RoomEnvironment;

/* ---------- 1. Configurações e estado ---------- */

// A pessoa pediu ao sistema menos movimento?
const REDUZ_MOVIMENTO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Celular ou tela pequena: 3D mais leve (sem antialias, menos resolução e menos detalhe).
const CELULAR = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

// GSAP vem dos <script defer> do HTML e fica em "window".
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const TEM_GSAP = Boolean(gsap && ScrollTrigger);
if (TEM_GSAP) gsap.registerPlugin(ScrollTrigger);

/*
  MODO DA LUZ RGB do teclado:
  - 'paleta'   = onda entre o vermelho e o ciano do site (combina com a identidade)
  - 'arcoiris' = o efeito arco-íris clássico do K552
  Troque aqui e salve para ver a diferença.
*/
const MODO_RGB = 'paleta';

const PALAVRA = 'kaisen7';          // as teclas dessa palavra ficam vermelhas
const DISTANCIA_CAMERA = 14;        // distância da câmera até o centro da cena
const TOTAL_CENAS = 4;              // 0 = abertura ... 4 = contato
const DOIS_PI = Math.PI * 2;
let COR_VERMELHA; // criadas depois que o Three.js carrega
let COR_CIANO;

// Baixa o Three.js do CDN (os endereços estão no "import map" do index.html)
async function carregarThree() {
  const [nucleo, caixa, ambiente] = await Promise.all([
    import('three'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/environments/RoomEnvironment.js'),
  ]);
  THREE = nucleo;
  RoundedBoxGeometry = caixa.RoundedBoxGeometry;
  RoomEnvironment = ambiente.RoomEnvironment;
  COR_VERMELHA = new THREE.Color(0xff2a1a);
  COR_CIANO = new THREE.Color(0x00e5ff);
}

// Estado que muda o tempo todo. "Alvo" = para onde queremos ir;
// o valor sem "Alvo" persegue o alvo aos poucos (fica suave).
const estado = {
  cenaAlvo: 0,   // número "quebrado" de 0 a 4: 1.5 = metade do caminho entre sobre e projetos
  cena: 0,
  brilhoAlvo: 0, // 0 = luz RGB normal, 1 = luz mais forte (seções escuras)
  brilho: 0,
  mouseX: 0,     // -1 a 1
  mouseY: 0,
};

/* ---------- 2. Funções auxiliares ---------- */

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lerp = (a, b, t) => a + (b - a) * t;               // mistura a e b
const suavizar = (t) => t * t * (3 - 2 * t);              // curva "smoothstep": começa e termina devagar
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

// Gerador de números aleatórios com "semente": sempre gera a mesma sequência.
// Assim as teclas caem sempre nos mesmos lugares a cada visita.
function criarAleatorio(semente) {
  return function () {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tela de loading
const elLoader = document.getElementById('loader');
const elBarra = document.getElementById('loader-progresso');
const elTextoLoader = document.getElementById('loader-texto');
function progressoLoader(valor, texto) {
  elBarra.style.transform = `scaleX(${valor})`;
  if (texto) elTextoLoader.textContent = texto;
}

// Espera as fontes carregarem (no máximo 2,5s, para não travar o loading)
async function carregarFontes() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('600 64px "Geist Mono"'),
        document.fonts.load('800 100px "Bricolage Grotesque"'),
      ]),
      esperar(2500),
    ]);
  } catch (e) {
    /* se falhar, seguimos com a fonte reserva */
  }
}

/* ---------- 3. Layout do teclado ----------
   Cada linha tem "espaco" (vão acima dela) e uma lista de teclas.
   "largura" é medida em teclas: 1 = tecla normal, 2 = tecla dupla etc.
   Rótulo null = espaço vazio (o vão entre blocos de teclas). */

const t = (rotulo, largura = 1) => ({ rotulo, largura });
const vao = (largura) => t(null, largura);
const varias = (texto) => [...texto].map((letra) => t(letra));
const lista = (...rotulos) => rotulos.map((r) => t(r));

// Layout TKL de 87 teclas, igual ao do K552 (usado no computador e no celular)
// (sem teclado numérico, com fileira F e o bloco de setas/navegação à direita)
const LAYOUT_K552 = [
  {
    espaco: 0,
    teclas: [t('esc'), vao(1), ...lista('f1', 'f2', 'f3', 'f4'), vao(0.5),
             ...lista('f5', 'f6', 'f7', 'f8'), vao(0.5), ...lista('f9', 'f10', 'f11', 'f12'),
             vao(0.25), ...lista('prtsc', 'scrlk', 'pause')],
  },
  { espaco: 0.35, teclas: [...varias('`1234567890-='), t('bksp', 2), vao(0.25), ...lista('ins', 'home', 'pgup')] },
  { espaco: 0, teclas: [t('tab', 1.5), ...varias('QWERTYUIOP[]'), t('\\', 1.5), vao(0.25), ...lista('del', 'end', 'pgdn')] },
  { espaco: 0, teclas: [t('caps', 1.75), ...varias("ASDFGHJKL;'"), t('enter', 2.25)] },
  { espaco: 0, teclas: [t('shift', 2.25), ...varias('ZXCVBNM,./'), t('shift', 2.75), vao(1.25), t('↑')] },
  {
    espaco: 0,
    teclas: [t('ctrl', 1.25), t('win', 1.25), t('alt', 1.25), t('kaisen7', 6.25),
             t('alt', 1.25), t('fn', 1.25), t('menu', 1.25), t('ctrl', 1.25),
             vao(0.25), ...lista('←', '↓', '→')],
  },
];

// Tecla física do computador (e.key) -> rótulo da tecla 3D (para o efeito de digitar)
const APELIDOS_TECLAS = {
  ' ': 'kaisen7', backspace: 'bksp', escape: 'esc', control: 'ctrl', meta: 'win',
  capslock: 'caps', contextmenu: 'menu', delete: 'del', insert: 'ins',
  pageup: 'pgup', pagedown: 'pgdn', printscreen: 'prtsc', scrolllock: 'scrlk',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
};

/* ---------- 4. Interface ---------- */

// ----- 4.0 Tema claro/escuro -----
// O <head> do index.html já escolheu o tema inicial. Aqui cuidamos do botão
// e de trocar as cores de fundo das seções conforme o tema.
const raiz = document.documentElement;
const metaTema = document.querySelector('meta[name="theme-color"]');
let secaoAtiva = document.getElementById('abertura'); // seção que está no meio da tela

const temaEscuro = () => raiz.getAttribute('data-tema') === 'escuro';

// Cor de fundo de uma seção no tema atual
function fundoDa(secao) {
  return temaEscuro() && secao.dataset.fundoEscuro ? secao.dataset.fundoEscuro : secao.dataset.fundo;
}

// Pinta o fundo do site com a cor da seção (com transição suave, se tiver GSAP)
function aplicarFundo(secao) {
  secaoAtiva = secao;
  const cor = fundoDa(secao);
  if (TEM_GSAP) {
    gsap.to(document.body, { backgroundColor: cor, duration: REDUZ_MOVIMENTO ? 0 : 0.7, ease: 'power2.out', overwrite: true });
  } else {
    document.body.style.backgroundColor = cor;
  }
  // No tema escuro todas as seções são escuras, então a luz RGB fica sempre forte
  estado.brilhoAlvo = temaEscuro() || secao.dataset.brilho === '1' ? 1 : 0;
  metaTema.setAttribute('content', cor);
}

function definirTema(tema, salvar) {
  raiz.setAttribute('data-tema', tema);
  if (salvar) {
    try { localStorage.setItem('tema', tema); } catch (e) { /* navegador sem armazenamento: tudo bem */ }
  }
  const botao = document.getElementById('tema-botao');
  botao.setAttribute('aria-label', tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro');
  aplicarFundo(secaoAtiva);
}

function iniciarTema() {
  const botao = document.getElementById('tema-botao');
  definirTema(temaEscuro() ? 'escuro' : 'claro', false);
  // Clique no botão: inverte e salva a escolha
  botao.addEventListener('click', () => definirTema(temaEscuro() ? 'claro' : 'escuro', true));
  // Se a pessoa mudar o modo do sistema e nunca clicou no botão, o site acompanha
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let salvo = null;
    try { salvo = localStorage.getItem('tema'); } catch (err) { /* ignora */ }
    if (!salvo) definirTema(e.matches ? 'escuro' : 'claro', false);
  });
}

// Faz "kaisen7" ocupar exatamente a largura da tela
function ajustarTitulo() {
  const titulo = document.querySelector('.titulo');
  const medida = document.querySelector('.titulo-medida');
  titulo.style.fontSize = '100px';                         // tamanho de teste
  const larguraTexto = medida.getBoundingClientRect().width;
  const larguraDisponivel = titulo.clientWidth;
  titulo.style.fontSize = `${(100 * larguraDisponivel) / larguraTexto}px`; // regra de três
}

function iniciarInterface() {
  ajustarTitulo();
  window.addEventListener('resize', ajustarTitulo);

  if (!TEM_GSAP) return; // sem GSAP o site funciona, só sem as animações de rolagem

  // 4.1 Cor de fundo: quando o meio da tela entra numa seção, o fundo muda para a cor dela
  document.querySelectorAll('[data-fundo]').forEach((secao) => {
    ScrollTrigger.create({
      trigger: secao,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) aplicarFundo(secao);
      },
    });
  });

  // 4.2 Progresso das cenas 3D: cada seção [data-cena] soma de 0 a 1
  // enquanto sobe da parte de baixo da tela até perto do topo.
  // Somando todas, temos estado.cenaAlvo indo de 0 (abertura) a 4 (contato).
  const cenas = document.querySelectorAll('[data-cena]');
  const progresso = new Array(cenas.length).fill(0);
  cenas.forEach((secao, i) => {
    const atualizar = (self) => {
      progresso[i] = self.progress;
      // Trava: com a página no topo (rolou menos de 40px), o teclado fica SEMPRE montado.
      // Protege contra celulares em que a barra do navegador muda a altura da tela.
      estado.cenaAlvo = window.scrollY < 40 ? 0 : progresso.reduce((soma, p) => soma + p, 0);
    };
    ScrollTrigger.create({
      trigger: secao,
      // 'top 75%' (e não 'top bottom'): só começa quando a seção já entrou um pouco na tela.
      // No iPhone a barra do navegador muda a altura da tela, e com 'top bottom'
      // a próxima seção "espiava" por baixo e soltava algumas teclas antes da hora.
      start: 'top 75%',
      end: 'top 20%',
      onUpdate: atualizar,
      onRefresh: atualizar,
    });
  });

  // 4.3 Textos com [data-revelar] sobem e aparecem ao entrar na tela
  if (!REDUZ_MOVIMENTO) {
    gsap.utils.toArray('[data-revelar]').forEach((el) => {
      gsap.from(el, {
        y: 48,
        autoAlpha: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
      });
    });
  }
}

/* ---------- 5. Cena 3D ---------- */

async function iniciar3D() {
  // 5.1 Renderizador: desenha a cena no <canvas>
  const canvas = document.getElementById('cena');
  const renderizador = new THREE.WebGLRenderer({
    canvas,
    antialias: !CELULAR,     // antialias pesa; no celular desligamos
    alpha: true,             // fundo transparente: quem pinta o fundo é o CSS
    powerPreference: 'high-performance',
  });
  // Pixel ratio alto = mais nítido, porém mais pesado. Limitamos.
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio, CELULAR ? 1.25 : 1.75));
  renderizador.setClearColor(0x000000, 0);
  renderizador.toneMapping = THREE.ACESFilmicToneMapping;
  renderizador.toneMappingExposure = 1.1;

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, DISTANCIA_CAMERA);

  // 5.2 Environment map: uma "sala" virtual que o metal e o verniz refletem.
  // O RoomEnvironment é gerado por código, então não baixamos nenhuma imagem HDR.
  const pmrem = new THREE.PMREMGenerator(renderizador);
  cena.environment = pmrem.fromScene(new RoomEnvironment(renderizador), 0.04).texture;
  pmrem.dispose();

  // Uma luz direcional para marcar as bordas das teclas
  const luz = new THREE.DirectionalLight(0xffffff, 1.6);
  luz.position.set(3, 6, 5);
  cena.add(luz);

  progressoLoader(0.55, 'ligando o RGB');

  // 5.3 Materiais (MeshPhysicalMaterial = material físico realista)
  // Teclas pretas com acabamento acetinado, como as do K552
  const plasticoPreto = new THREE.MeshPhysicalMaterial({
    color: 0x0b0c0e,
    metalness: 0.15,
    roughness: 0.5,
    clearcoat: CELULAR ? 0 : 0.35,   // camada de "verniz" (só no computador)
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.35,           // reflete pouco o ambiente: assim a tecla fica preta de verdade
  });
  // Teclas de "kaisen7": metal vermelho, como um keycap de destaque
  const metalVermelho = new THREE.MeshPhysicalMaterial({
    color: 0xe10600,
    metalness: 0.9,
    roughness: 0.22,
    clearcoat: CELULAR ? 0 : 1,
    clearcoatRoughness: 0.08,
  });
  // Corpo do teclado: placa de metal preta (o K552 tem tampa de alumínio)
  const metalPreto = new THREE.MeshPhysicalMaterial({
    color: 0x0d0e10,
    metalness: 0.85,
    roughness: 0.32,
  });

  // Textura de "brilho" (um degradê redondo) usada na luz embaixo de cada tecla
  const texturaBrilho = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // 5.4 Montagem das teclas
  const layout = LAYOUT_K552;
  const larguraTeclado = Math.max(...layout.map((linha) => linha.teclas.reduce((s, k) => s + k.largura, 0)));
  // posição Z de cada linha (soma os vãos entre a fileira F e o resto)
  let zAtual = 0;
  const zLinhas = layout.map((linha) => {
    zAtual += linha.espaco;
    const z = zAtual;
    zAtual += 1;
    return z;
  });
  const profundidade = zAtual;
  const ALTURA = 0.5;   // altura da tecla
  const FOLGA = 0.1;    // espaço entre teclas
  const aleatorio = criarAleatorio(7);

  // "mundo" agrupa tudo: girando ele, gira a cena inteira (efeito do mouse)
  const mundo = new THREE.Group();
  cena.add(mundo);

  // Geometrias reaproveitadas por largura (economiza memória)
  const cache = new Map();
  function geometria(chave, criar) {
    if (!cache.has(chave)) cache.set(chave, criar());
    return cache.get(chave);
  }

  // Desenha a "legenda" (a letra) em branco num <canvas> 2D.
  // A cor RGB é aplicada depois pelo material, então a mesma textura serve para qualquer cor.
  function criarLegenda(texto, largura, prof) {
    const px = CELULAR ? 96 : 128; // no celular, textura um pouco menor (economiza memória)
    const c = document.createElement('canvas');
    c.width = Math.round(px * (largura / prof));
    c.height = px;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    if (texto === 'kaisen7') {
      // barra de espaço: nome centralizado
      ctx.font = `600 ${px * 0.32}px "Geist Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(texto, c.width / 2, px * 0.36);
    } else {
      // demais teclas: legenda no canto superior esquerdo, como no teclado de verdade
      const tamanho = texto.length > 2 ? px * 0.24 : texto.length === 2 ? px * 0.32 : px * 0.5;
      ctx.font = `700 ${tamanho}px "Geist Mono", monospace`;
      ctx.fillText(texto, px * 0.14, px * 0.12);
    }
    const textura = new THREE.CanvasTexture(c);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    return textura;
  }

  const itens = [];  // todas as teclas
  const novaPose = () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), escala: 1 });

  layout.forEach((linha, indiceLinha) => {
    let x = 0;
    linha.teclas.forEach((def) => {
      const inicio = x;
      x += def.largura;
      if (def.rotulo === null) return; // é só um vão, não cria tecla

      // posição da tecla dentro do teclado (o centro do teclado é 0,0,0)
      const centroX = inicio + def.largura / 2 - larguraTeclado / 2;
      const centroZ = zLinhas[indiceLinha] + 0.5 - profundidade / 2;

      const rotulo = def.rotulo.toLowerCase();
      const ehDaPalavra = rotulo.length === 1 && PALAVRA.includes(rotulo);

      const grupo = new THREE.Group();

      // Corpo da tecla (keycap)
      grupo.add(new THREE.Mesh(
        geometria(`tecla${def.largura}`, () =>
          new RoundedBoxGeometry(def.largura - FOLGA, ALTURA, 1 - FOLGA, CELULAR ? 2 : 4, 0.12)),
        ehDaPalavra ? metalVermelho : plasticoPreto
      ));

      // Legenda: plano fininho colado em cima da tecla, com a letra "acesa"
      const larguraLegenda = def.largura - FOLGA - 0.22;
      const profLegenda = 1 - FOLGA - 0.22;
      const matLegenda = new THREE.MeshBasicMaterial({
        map: criarLegenda(rotulo, larguraLegenda, profLegenda),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const legenda = new THREE.Mesh(
        geometria(`legenda${def.largura}`, () => new THREE.PlaneGeometry(larguraLegenda, profLegenda)),
        matLegenda
      );
      legenda.rotation.x = -Math.PI / 2;       // deita o plano
      legenda.position.y = ALTURA / 2 + 0.003; // um tiquinho acima da tecla
      grupo.add(legenda);

      // Luz RGB embaixo da tecla (o K552 tem teclas "flutuantes" e a luz vaza pelos lados)
      const matBrilho = new THREE.MeshBasicMaterial({
        map: texturaBrilho,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const brilho = new THREE.Mesh(
        geometria(`brilho${def.largura}`, () => new THREE.PlaneGeometry(def.largura + 0.45, 1.45)),
        matBrilho
      );
      brilho.rotation.x = -Math.PI / 2;
      brilho.position.y = -ALTURA / 2 - 0.13;  // logo acima da placa do teclado
      grupo.add(brilho);

      mundo.add(grupo);
      itens.push({
        objeto: grupo,
        rotulo,
        largura: def.largura,
        local: new THREE.Vector3(centroX, 0, centroZ),
        ehDaPalavra,
        matLegenda,
        matBrilho,
        aperto: 0,                     // 0 = solta, 1 = apertada
        atraso: aleatorio() * 0.35,    // cada tecla sai num tempo diferente
        giro: 0.5 + aleatorio(),       // velocidade de rotação própria
        r: Array.from({ length: 6 }, aleatorio), // números aleatórios fixos da tecla
        A: novaPose(),
        B: novaPose(),
      });
    });
  });
  itens.forEach((item, i) => (item.indice = i));
  const totalTeclas = itens.length;

  // Corpo do teclado (placa de metal embaixo das teclas)
  const base = {
    objeto: new THREE.Mesh(
      new RoundedBoxGeometry(larguraTeclado + 0.5, 0.55, profundidade + 0.5, CELULAR ? 2 : 4, 0.2),
      metalPreto
    ),
    local: new THREE.Vector3(0, -0.68, 0),
    ehBase: true,
    aperto: 0,
    atraso: 0,
    r: [0, 0, 0, 0, 0, 0],
    A: novaPose(),
    B: novaPose(),
  };
  mundo.add(base.objeto);

  progressoLoader(0.8, 'encaixando as teclas');

  /* ---------- 6. Arrumações das teclas ----------
     Para cada cena (0 a 4) calculamos onde cada tecla deve estar.
     Depois o loop mistura a arrumação atual com a próxima. */

  // visivelEm(z) diz quanto da cena cabe na tela na profundidade z
  function visivelEm(z) {
    const d = DISTANCIA_CAMERA - z;
    const altura = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d;
    return { w: altura * camera.aspect, h: altura };
  }

  let larguraVisivel = 1;
  let alturaVisivel = 1;
  let retrato = false;  // tela "em pé" (celular)?
  const arrumacao = {
    abertura: { centro: new THREE.Vector3(), escala: 1, rot: new THREE.Euler() },
    contato: { centro: new THREE.Vector3(), escala: 1, rot: new THREE.Euler() },
  };

  function atualizarMedidas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderizador.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    ({ w: larguraVisivel, h: alturaVisivel } = visivelEm(0));
    retrato = larguraVisivel < alturaVisivel;

    // Tamanho do teclado na abertura: cabe na largura e na altura
    const escala = Math.min(
      (larguraVisivel * (retrato ? 0.93 : 0.66)) / larguraTeclado,
      (alturaVisivel * 0.42) / (profundidade * 0.75)
    );
    const ab = arrumacao.abertura;
    ab.escala = escala;
    ab.centro.set(0, alturaVisivel * (retrato ? 0.06 : 0.17), 0);
    ab.rot.set(0.95, 0, 0); // inclinado para a câmera ver o topo das teclas

    // No celular o teclado do contato fica na parte de baixo, entre os links e o rodapé
    const ct = arrumacao.contato;
    ct.escala = escala * (retrato ? 0.75 : 0.5);
    ct.centro.set(retrato ? 0 : larguraVisivel * 0.33, alturaVisivel * (retrato ? -0.23 : 0.25), retrato ? -3 : -2);
    ct.rot.set(0.8, retrato ? 0 : -0.4, retrato ? 0 : 0.12);
  }

  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();

  // Posição de uma peça quando o teclado está montado
  function poseMontado(item, conf, saida, tempo) {
    _q.setFromEuler(conf.rot);
    saida.pos.copy(item.local).multiplyScalar(conf.escala).applyQuaternion(_q).add(conf.centro);
    saida.pos.y += Math.sin(tempo * 0.9) * 0.06; // flutua de leve
    saida.quat.copy(_q);
    saida.escala = conf.escala;
  }

  // Calcula a pose de um item na cena "n" e guarda em "saida"
  function calcularPose(n, item, tempo, saida) {
    const r = item.r;

    // Cena 0 (abertura) e 4 (contato): teclado montado
    if (n === 0) return poseMontado(item, arrumacao.abertura, saida, tempo);
    if (n === 4) return poseMontado(item, arrumacao.contato, saida, tempo);

    // O corpo do teclado sai por baixo da tela nas cenas do meio
    if (item.ehBase) {
      poseMontado(item, arrumacao.abertura, saida, tempo);
      saida.pos.y -= alturaVisivel * 1.4;
      return;
    }

    if (n === 1) {
      // SOBRE: teclas soltas flutuando, mais para a direita (o texto fica à esquerda)
      const z = -1 - r[2] * 9;
      const { w, h } = visivelEm(z);
      const [xMin, xMax] = retrato ? [-0.5, 0.5] : [-0.12, 0.5];
      saida.pos.set(
        lerp(xMin, xMax, r[0]) * w,
        (r[1] - 0.5) * h * 0.95 + Math.sin(tempo * 0.6 + r[3] * 10) * 0.25,
        z
      );
      _e.set(r[3] * DOIS_PI + tempo * 0.25 * item.giro, r[4] * DOIS_PI + tempo * 0.18 * item.giro, r[5] * DOIS_PI);
      saida.quat.setFromEuler(_e);
      saida.escala = arrumacao.abertura.escala * 1.05;
      return;
    }

    if (n === 2) {
      // PROJETOS: um anel inclinado que gira devagar
      const zc = -6;
      const { w, h } = visivelEm(zc);
      const raio = Math.min(w, h) * (retrato ? 0.36 : 0.28) * (0.9 + r[0] * 0.2);
      const angulo = (item.indice / totalTeclas) * DOIS_PI + tempo * 0.12;
      _v.set(Math.cos(angulo) * raio, Math.sin(angulo) * raio, (r[1] - 0.5) * 1.2);
      _e.set(-0.35, 0.5, 0);
      _v.applyEuler(_e);
      // no celular o anel desce para a metade de baixo, longe do texto
      saida.pos.set(retrato ? 0 : w * 0.34, retrato ? -h * 0.24 : 0, zc).add(_v);
      _e.set(angulo + tempo * 0.3 * item.giro, r[4] * DOIS_PI + tempo * 0.2, r[5]);
      saida.quat.setFromEuler(_e);
      saida.escala = arrumacao.abertura.escala * 0.85;
      return;
    }

    // n === 3 — SERVIÇOS: uma parede de teclas de frente, com uma onda passando
    const zc = -8;
    const { w, h } = visivelEm(zc);
    const colunas = Math.ceil(Math.sqrt((totalTeclas * w) / h));
    const linhas = Math.ceil(totalTeclas / colunas);
    const passo = Math.min((w * 1.02) / colunas, (h * 1.02) / linhas);
    const c = item.indice % colunas;
    const l = Math.floor(item.indice / colunas);
    const onda = Math.sin(c * 0.55 + l * 0.45 - tempo * 1.4);
    saida.pos.set((c - (colunas - 1) / 2) * passo, ((linhas - 1) / 2 - l) * passo, zc + onda * 0.9);
    _e.set(Math.PI / 2 + onda * 0.3, 0, 0); // PI/2 = topo da tecla virado para a câmera
    saida.quat.setFromEuler(_e);
    // 0.42 = teclas pequenas com bastante espaço entre elas (o texto continua legível)
    saida.escala = (passo * 0.42) / Math.max(1, item.largura);
  }

  // Coloca o item no ponto certo entre a cena "i" e a cena "i + 1"
  function posicionarItem(item, i, f, tempo) {
    calcularPose(i, item, tempo, item.A);
    calcularPose(Math.min(i + 1, TOTAL_CENAS), item, tempo, item.B);

    // Cada tecla começa a viagem com um atraso diferente (fica mais orgânico)
    const fk = suavizar(limitar((f - item.atraso) / 0.65, 0, 1));
    const obj = item.objeto;
    obj.position.lerpVectors(item.A.pos, item.B.pos, fk);
    obj.quaternion.slerpQuaternions(item.A.quat, item.B.quat, fk);
    obj.scale.setScalar(lerp(item.A.escala, item.B.escala, fk));

    // No meio do caminho a tecla faz uma curva (sobe para perto da câmera)
    const arco = Math.sin(fk * Math.PI);
    obj.position.z += arco * item.r[2] * 3;
    obj.position.x += arco * (item.r[0] - 0.5) * 2;

    // Efeito de "apertar": empurra a tecla para baixo, na direção do próprio corpo
    if (item.aperto > 0) {
      _v.set(0, -1, 0).applyQuaternion(obj.quaternion).multiplyScalar(item.aperto * 0.3 * obj.scale.x);
      obj.position.add(_v);
    }
  }

  // Luz RGB: calcula a cor de cada tecla
  const _cor = new THREE.Color();
  function corRGB(item, tempo, saida) {
    if (item.ehDaPalavra) return saida.copy(COR_VERMELHA);
    // u = posição da tecla de 0 (esquerda) a 1 (direita): a onda anda da esquerda pra direita
    const u = item.local.x / larguraTeclado + 0.5;
    if (MODO_RGB === 'arcoiris') {
      return saida.setHSL((((u - tempo * 0.12) % 1) + 1) % 1, 1, 0.55);
    }
    const onda = 0.5 + 0.5 * Math.sin(u * DOIS_PI * 0.9 - tempo * 1.6);
    return saida.copy(COR_VERMELHA).lerp(COR_CIANO, onda);
  }

  function atualizarLuzes(tempo) {
    // A luz embaixo das teclas só aparece com o teclado montado (abertura e contato)
    const montado = limitar(1 - estado.cena, 0, 1) + limitar(estado.cena - 3, 0, 1);
    const forcaBrilho = montado * lerp(0.55, 0.95, estado.brilho);
    // As legendas brilham mais nas seções escuras
    const forcaLegenda = lerp(0.9, 1.25, estado.brilho);
    itens.forEach((item) => {
      corRGB(item, tempo, _cor);
      // tecla apertada fica branca por um instante (como um "flash")
      if (item.aperto > 0) _cor.lerp(new THREE.Color(1, 1, 1), item.aperto * 0.8);
      item.matLegenda.color.copy(_cor).multiplyScalar(item.ehDaPalavra ? 1.2 : forcaLegenda);
      if (item.ehDaPalavra) item.matLegenda.color.setRGB(1, 1, 1); // letra branca no keycap vermelho
      item.matBrilho.color.copy(_cor);
      item.matBrilho.opacity = forcaBrilho;
      item.matBrilho.visible = forcaBrilho > 0.01;
    });
  }

  /* ---------- 7. Loop de animação ---------- */

  atualizarMedidas();
  let precisaDesenhar = true;
  window.addEventListener('resize', () => {
    atualizarMedidas();
    precisaDesenhar = true;
  });

  // Mouse mexe a cena de leve (só em quem tem mouse e não pediu menos movimento)
  if (!CELULAR && !REDUZ_MOVIMENTO) {
    window.addEventListener('pointermove', (e) => {
      estado.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      estado.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }

  // Digitar no teclado de verdade aperta a tecla 3D correspondente
  window.addEventListener('keydown', (e) => {
    if (!TEM_GSAP || e.repeat) return;
    const tecla = APELIDOS_TECLAS[e.key.toLowerCase()] ?? APELIDOS_TECLAS[e.key] ?? e.key.toLowerCase();
    itens
      .filter((item) => item.rotulo === tecla)
      .forEach((item) => {
        gsap.to(item, {
          aperto: 1, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut', overwrite: true,
          onUpdate: () => (precisaDesenhar = true),
        });
      });
  });

  const relogio = new THREE.Clock();
  const todos = [...itens, base];
  let assinaturaAnterior = '';

  function quadro() {
    requestAnimationFrame(quadro);

    // Com movimento reduzido o tempo fica parado e a cena "pula" de uma arrumação
    // para a outra, sem as teclas voando pela tela.
    const tempo = REDUZ_MOVIMENTO ? 0 : relogio.getElapsedTime();
    if (REDUZ_MOVIMENTO) {
      estado.cena = Math.round(estado.cenaAlvo);
      estado.brilho = estado.brilhoAlvo;
    } else {
      estado.cena += (estado.cenaAlvo - estado.cena) * 0.075;   // persegue o alvo (suave)
      estado.brilho += (estado.brilhoAlvo - estado.brilho) * 0.05;
    }

    // No modo reduzido só redesenha quando algo mudou (economiza bateria)
    if (REDUZ_MOVIMENTO) {
      const assinatura = `${estado.cena}|${estado.brilho}`;
      if (assinatura === assinaturaAnterior && !precisaDesenhar) return;
      assinaturaAnterior = assinatura;
    }
    precisaDesenhar = false;

    // Qual trecho entre cenas estamos? Ex.: cena 1.3 -> i = 1, f = 0.3
    const cenaAtual = limitar(estado.cena, 0, TOTAL_CENAS);
    const i = Math.min(Math.floor(cenaAtual), TOTAL_CENAS - 1);
    const f = cenaAtual - i;
    todos.forEach((item) => posicionarItem(item, i, f, tempo));
    atualizarLuzes(tempo);

    // Inclinação pelo mouse
    mundo.rotation.y += (estado.mouseX * 0.12 - mundo.rotation.y) * 0.05;
    mundo.rotation.x += (estado.mouseY * 0.06 - mundo.rotation.x) * 0.05;

    renderizador.render(cena, camera);
  }

  // Compila os shaders antes de mostrar (evita um "engasgo" na primeira imagem)
  renderizador.compile(cena, camera);
  quadro();

  // Devolve as teclas de "kaisen7" na ordem da palavra, para a introdução
  const teclasDaPalavra = [...PALAVRA].map((letra) => itens.find((item) => item.rotulo === letra));
  return { teclasDaPalavra };
}

/* ---------- 8. Introdução e início ---------- */

function introducao(teclasDaPalavra) {
  if (!TEM_GSAP || REDUZ_MOVIMENTO) return;
  const linha = gsap.timeline({ delay: 0.2 });
  // As letras do título sobem uma por uma...
  linha.to('.titulo .letra', { yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: 0.09 }, 0);
  // ...e ao mesmo tempo a tecla correspondente é "digitada" no teclado 3D
  teclasDaPalavra.forEach((tecla, i) => {
    if (!tecla) return;
    linha.to(tecla, { aperto: 1, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 0.05 + i * 0.09);
  });
  linha.from('.abertura-info > *, .topo', { autoAlpha: 0, y: 10, duration: 0.6, stagger: 0.06 }, 0.5);
}

async function principal() {
  progressoLoader(0.15, 'carregando fontes');
  // Esconde as letras do título já no começo (a introdução mostra depois)
  if (TEM_GSAP && !REDUZ_MOVIMENTO) gsap.set('.titulo .letra', { yPercent: 110 });

  await carregarFontes();
  iniciarInterface();

  let teclasDaPalavra = [];
  try {
    progressoLoader(0.35, 'montando o teclado');
    await carregarThree();
    ({ teclasDaPalavra } = await iniciar3D());
  } catch (erro) {
    // Sem WebGL (ou algum erro): o site segue funcionando, só sem o 3D
    console.warn('3D desativado:', erro);
    document.documentElement.classList.add('sem-3d');
  }

  progressoLoader(1, 'pronto');
  await esperar(250);
  elLoader.classList.add('loader--saiu');
  if (TEM_GSAP) ScrollTrigger.refresh();
  introducao(teclasDaPalavra);
}

iniciarTema();
principal();

})();
