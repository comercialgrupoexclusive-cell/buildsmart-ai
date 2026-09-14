"""Gera um panorama equiretangular (2:1) evocando a referência: céu noturno
com Via Láctea, cordilheiras em camadas com névoa no vale, brilho de pôr do
sol num lado e primeiro plano rochoso. Saída: JPG 4096x2048.

Este é um substituto gerado — o panorama 4K real (foto) pode trocar este
arquivo sem nenhuma mudança de código (mesmo caminho, ver ORIGEM.md).

Decisões que importam:
- costura horizontal: todo ruído de longitude usa frequências INTEIRAS, então
  a coluna 0 encosta na coluna W-1 sem emenda;
- estrelas uniformes na esfera (z uniforme), senão amontoam nos polos;
- as cordilheiras são silhuetas h(lon) compostas de longe para perto: a de
  perto sobrescreve a de longe, então aparece na frente, mais escura; as de
  longe ficam mais claras e azuladas (perspectiva atmosférica).
"""
import pathlib

import numpy as np
import imageio.v3 as iio

W, H = 4096, 2048
RNG = np.random.default_rng(20260914)
OUT = pathlib.Path(__file__).resolve().parent.parent / "public/experimento-360/ceu-profundo-4k.jpg"

lon = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi          # -pi..pi
lat = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi          # +pi/2..-pi/2
LON, LAT = np.meshgrid(lon, lat)
latg = np.degrees(LAT)                                       # graus, +90..-90

# Longitude do pôr do sol: fica no "olhar inicial" (lon 0 é o centro da vista).
SOL_LON = np.deg2rad(38.0)


def wrapped_noise_1d(freqs, seed):
    """Ruído contínuo em função só da longitude, com costura perfeita."""
    rng = np.random.default_rng(seed)
    out = np.zeros(W, dtype=np.float32)
    for n, amp in freqs:
        p = rng.uniform(0, 2 * np.pi)
        out += amp * np.sin(n * lon + p)
    return out


def wrapped_noise_2d(octaves, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), dtype=np.float32)
    for freq, amp in octaves:
        for _ in range(3):
            n = rng.integers(1, freq + 1)
            m = rng.uniform(0.5, freq)
            pa, pb = rng.uniform(0, 2 * np.pi, 2)
            out += amp * np.sin(n * LON + pa).astype(np.float32) * \
                np.cos(m * LAT + pb).astype(np.float32)
    return out


img = np.zeros((H, W, 3), dtype=np.float32)

# ============================================================= CÉU
# Gradiente vertical: mais escuro no alto, clareia perto do horizonte.
alt = np.clip(latg / 90.0, 0, 1)                             # 0 no horizonte, 1 no zênite
ceu_alto = np.array([0.006, 0.013, 0.038])
ceu_horiz = np.array([0.022, 0.042, 0.092])
for c in range(3):
    img[..., c] = ceu_horiz[c] + (ceu_alto[c] - ceu_horiz[c]) * np.clip(alt, 0, 1) ** 0.7

# Via Láctea: faixa inclinada, com nuvem de brilho + poeira.
tilt = np.deg2rad(24.0)
swing = np.deg2rad(30.0)
px = -np.sin(tilt) * np.cos(swing)
py = -np.sin(tilt) * np.sin(swing)
pz = np.cos(tilt)
cl = np.cos(LAT)
vx, vy, vz = cl * np.cos(LON), cl * np.sin(LON), np.sin(LAT)
band_s = vx * px + vy * py + vz * pz
via = np.exp(-(band_s / 0.16) ** 2).astype(np.float32)
neb = wrapped_noise_2d([(2, 1.0), (4, 0.55), (8, 0.30), (16, 0.16)], 7)
neb = (neb - neb.min()) / (neb.max() - neb.min())
neb = np.clip((neb - 0.45) / 0.55, 0, 1) ** 1.7
via_n = via * (0.45 + 0.55 * neb)
so_ceu = np.clip(alt * 3, 0, 1)                              # some perto do horizonte
img[..., 0] += (via * 0.020 + via_n * 0.045) * so_ceu
img[..., 1] += (via * 0.024 + via_n * 0.040) * so_ceu
img[..., 2] += (via * 0.045 + via_n * 0.085) * so_ceu

# Nuvens finas altas.
nuv = wrapped_noise_2d([(3, 1.0), (6, 0.5), (12, 0.25)], 21)
nuv = (nuv - nuv.min()) / (nuv.max() - nuv.min())
nuv = np.clip((nuv - 0.62) / 0.38, 0, 1) ** 1.5 * np.clip((latg - 8) / 40, 0, 1)
for c, v in enumerate((0.05, 0.06, 0.085)):
    img[..., c] += nuv * v

# ============================================================= ESTRELAS
def sample_sphere(n, rng):
    z = rng.uniform(-1, 1, n)
    th = rng.uniform(0, 2 * np.pi, n)
    r = np.sqrt(1 - z * z)
    return np.stack([r * np.cos(th), r * np.sin(th), z], 1)


def splat(target, xs, ys, amps, sig_x, sig_y, cols):
    kx = max(1, int(np.ceil(2.6 * float(sig_x.max()))))
    ky = max(1, int(np.ceil(2.6 * float(sig_y.max()))))
    xi = np.floor(xs).astype(np.int64)
    yi = np.floor(ys).astype(np.int64)
    fx, fy = xs - xi, ys - yi
    inv2x, inv2y = 1.0 / (2 * sig_x ** 2), 1.0 / (2 * sig_y ** 2)
    for dy in range(-ky, ky + 1):
        yy = yi + dy
        ok = (yy >= 0) & (yy < H)
        if not ok.any():
            continue
        wy = np.exp(-((dy - fy) ** 2) * inv2y)
        yv = yy[ok]
        for dx in range(-kx, kx + 1):
            wx = np.exp(-((dx - fx) ** 2) * inv2x)
            w = (wx * wy * amps)[ok]
            xx = np.mod(xi + dx, W)[ok]
            for c in range(3):
                np.add.at(target[..., c], (yv, xx), w * cols[ok, c])


def draw_stars(n, rng, escala):
    v = sample_sphere(n, rng)
    la = np.arcsin(np.clip(v[:, 2], -1, 1))
    lo = np.arctan2(v[:, 1], v[:, 0])
    # Só no céu (acima do horizonte); densidade cresce com a altitude.
    manter = la > np.deg2rad(2)
    v, la, lo = v[manter], la[manter], lo[manter]
    xs = (lo + np.pi) / (2 * np.pi) * W
    ys = (np.pi / 2 - la) / np.pi * H
    u = rng.random(len(la))
    amp = ((u ** 5.5) * 1.0 + 0.010) * escala
    sig = 0.5 + (u ** 6) * 1.2
    t = rng.normal(0, 1, len(la))
    cols = np.stack([
        np.clip(1.0 - 0.055 * t, 0.72, 1.0),
        np.clip(1.0 - 0.012 * np.abs(t), 0.82, 1.0),
        np.clip(1.0 + 0.055 * t, 0.78, 1.0),
    ], 1).astype(np.float32)
    stretch = np.clip(1.0 / np.maximum(np.cos(la), 1e-6), 1.0, 6.0)
    sbin = np.digitize(stretch, [1.25, 1.9, 3.0, 4.5])
    for b in np.unique(sbin):
        m = sbin == b
        splat(img, xs[m], ys[m], amp[m], (sig * stretch)[m], sig[m], cols[m])


draw_stars(30000, np.random.default_rng(11), 0.60)
draw_stars(18000, np.random.default_rng(12), 0.42)
draw_stars(150, np.random.default_rng(13), 1.7)

# ============================================================= PÔR DO SOL
dlon = np.arctan2(np.sin(LON - SOL_LON), np.cos(LON - SOL_LON))
sol = np.exp(-(dlon / 0.38) ** 2) * np.exp(-((latg - 1.0) / 6.5) ** 2)
sol = sol.astype(np.float32)
img[..., 0] += sol * 0.50
img[..., 1] += sol * 0.26
img[..., 2] += sol * 0.11
halo = np.exp(-(dlon / 0.9) ** 2) * np.exp(-((latg - 4) / 16.0) ** 2)
img[..., 0] += halo * 0.07
img[..., 1] += halo * 0.04
img[..., 2] += halo * 0.035

# ============================================================= CORDILHEIRAS
def ridge(seed, base, amp, freqs, detalhe):
    """Elevação (graus) do topo da serra por coluna de longitude."""
    h = wrapped_noise_1d(freqs, seed)
    h = h / (np.abs(h).max() + 1e-6)
    d = wrapped_noise_1d(detalhe, seed + 100)
    d = d / (np.abs(d).max() + 1e-6)
    return base + amp * h + amp * 0.25 * d


def pintar_serra(elev_graus, cor_base, cor_topo, escurecer_por_prof=0.0, seed=0):
    """Onde o pixel está abaixo do topo da serra, pinta a montanha."""
    elev = elev_graus[None, :]                              # (1, W)
    dentro = latg < elev                                    # (H, W) bool
    if not dentro.any():
        return
    prof = np.clip((elev - latg) / 30.0, 0, 1)             # 0 no topo, 1 fundo
    # Textura leve na encosta.
    tex = wrapped_noise_2d([(5, 1.0), (11, 0.5), (23, 0.3)], seed)
    tex = (tex - tex.min()) / (tex.max() - tex.min())
    for c in range(3):
        base = cor_topo[c] + (cor_base[c] - cor_topo[c]) * prof
        base = base * (1.0 - escurecer_por_prof * prof)
        base = base * (0.82 + 0.36 * tex)
        img[..., c] = np.where(dentro, base, img[..., c])


# Névoa no vale: banda clara suave logo acima da linha do horizonte, atrás das
# serras próximas (pintada antes delas).
fog = np.exp(-((latg - 1.0) / 3.2) ** 2)
fogn = wrapped_noise_2d([(2, 1.0), (5, 0.6), (9, 0.3)], 33)
fogn = (fogn - fogn.min()) / (fogn.max() - fogn.min())
fog = (fog * (0.4 + 0.6 * fogn)).astype(np.float32)

# Serra distante (clara, azulada — perspectiva atmosférica).
e_far = ridge(1, base=8.5, amp=3.5, freqs=[(3, 1.0), (5, 0.6), (7, 0.4)],
              detalhe=[(13, 1.0), (19, 0.6)])
pintar_serra(e_far, cor_base=(0.10, 0.15, 0.26), cor_topo=(0.14, 0.20, 0.32), seed=41)
# Sol tinge as serras distantes do lado do poente.
tinge = (np.exp(-(dlon / 0.9) ** 2) * (latg < e_far[None, :]) * np.exp(-((latg - 4) / 10.0) ** 2)).astype(np.float32)
img[..., 0] += tinge * 0.14
img[..., 1] += tinge * 0.07
img[..., 2] += tinge * 0.03

# Névoa por cima da serra distante.
so_fog = np.clip((e_far[None, :] + 4 - latg) / 8, 0, 1) * (latg < 12)
for c, v in enumerate((0.16, 0.20, 0.28)):
    img[..., c] += fog * v * so_fog

# Serra média.
e_mid = ridge(2, base=5.0, amp=5.0, freqs=[(2, 1.0), (4, 0.7), (6, 0.5)],
              detalhe=[(11, 1.0), (17, 0.7), (29, 0.4)])
pintar_serra(e_mid, cor_base=(0.045, 0.075, 0.135), cor_topo=(0.075, 0.11, 0.185),
             escurecer_por_prof=0.15, seed=52)
# Serra próxima.
e_near = ridge(3, base=1.5, amp=5.5, freqs=[(2, 1.0), (3, 0.8), (5, 0.6)],
               detalhe=[(9, 1.0), (15, 0.7), (27, 0.5)])
pintar_serra(e_near, cor_base=(0.020, 0.035, 0.070), cor_topo=(0.045, 0.065, 0.115),
             escurecer_por_prof=0.25, seed=63)

# ============================================================= PRIMEIRO PLANO
# Rocha escura ocupando a base. Topo irregular (borda do platô).
e_chao = ridge(4, base=-9.0, amp=7.0, freqs=[(2, 1.0), (3, 0.7), (4, 0.6)],
               detalhe=[(7, 1.0), (13, 0.8), (25, 0.6), (47, 0.4)])
chao = latg < e_chao[None, :]
rocha = wrapped_noise_2d([(6, 1.0), (13, 0.6), (27, 0.4), (53, 0.25)], 71)
rocha = (rocha - rocha.min()) / (rocha.max() - rocha.min())
prof_chao = np.clip((e_chao[None, :] - latg) / 60.0, 0, 1)
for c, (base, topo) in enumerate((
    (0.006, 0.030), (0.010, 0.040), (0.020, 0.065),
)):
    val = (topo + (base - topo) * prof_chao) * (0.5 + 1.0 * rocha)
    img[..., c] = np.where(chao, val, img[..., c])

# Borda do platô levemente iluminada de azul (recorte contra a névoa).
borda = chao & (latg > (e_chao[None, :] - 1.2))
img[..., 2] = np.where(borda, img[..., 2] + 0.05, img[..., 2])
img[..., 1] = np.where(borda, img[..., 1] + 0.02, img[..., 1])

# Pontos bioluminescentes espalhados pelo chão (como na referência).
rng = np.random.default_rng(88)
npts = 220
plon = rng.uniform(-np.pi, np.pi, npts)
plat = np.deg2rad(rng.uniform(-70, -6, npts))
pxs = (plon + np.pi) / (2 * np.pi) * W
pys = (np.pi / 2 - plat) / np.pi * H
amp = rng.uniform(0.05, 0.35, npts)
cols = np.tile(np.array([[0.3, 0.6, 1.0]]), (npts, 1)).astype(np.float32)
splat(img, pxs, pys, amp, np.full(npts, 1.4), np.full(npts, 1.4), cols)

# ============================================================= FINALIZAÇÃO
img = np.clip(img, 0, 1)
srgb = np.where(img <= 0.0031308, img * 12.92, 1.055 * img ** (1 / 2.4) - 0.055)
srgb = srgb + RNG.uniform(-0.5, 0.5, srgb.shape) / 255.0
out = np.clip(srgb * 255.0 + 0.5, 0, 255).astype(np.uint8)

d = np.abs(out[:, 0].astype(int) - out[:, -1].astype(int)).mean()
print("diferenca media coluna 0 vs W-1:", round(float(d), 3))

iio.imwrite(OUT, out, quality=92)
print("ok", out.shape)
