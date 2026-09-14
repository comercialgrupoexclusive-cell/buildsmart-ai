"""Gera um panorama equiretangular (2:1) de ceu profundo, com costura
horizontal perfeita. Saida: JPG 4096x2048.

Decisoes que importam:
- estrelas distribuidas UNIFORMEMENTE NA ESFERA (z uniforme em [-1,1]),
  senao elas se acumulam nos polos ao projetar em equiretangular;
- todo ruido de nebulosa usa frequencias INTEIRAS em longitude, o que
  garante continuidade exata entre a coluna 0 e a coluna W-1 (sem costura);
- cada estrela e esticada horizontalmente por 1/cos(lat) para continuar
  redonda depois da projecao.
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

# ---------------------------------------------------------------- fundo
img = np.zeros((H, W, 3), dtype=np.float32)
img[..., 0] = 0.0016
img[..., 1] = 0.0022
img[..., 2] = 0.0052

cl = np.cos(LAT)
vx, vy, vz = cl * np.cos(LON), cl * np.sin(LON), np.sin(LAT)

tilt = np.deg2rad(27.0)
swing = np.deg2rad(40.0)
px = -np.sin(tilt) * np.cos(swing)
py = -np.sin(tilt) * np.sin(swing)
pz = np.cos(tilt)
band_s = vx * px + vy * py + vz * pz          # 0 = centro da faixa


def wrapped_noise(octaves, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), dtype=np.float32)
    for freq, amp in octaves:
        for _ in range(3):
            n = rng.integers(1, freq + 1)      # inteiro => costura perfeita
            m = rng.uniform(0.5, freq)
            pa, pb = rng.uniform(0, 2 * np.pi, 2)
            out += amp * np.sin(n * LON + pa).astype(np.float32) * \
                np.cos(m * LAT + pb).astype(np.float32)
    return out


neb = wrapped_noise([(2, 1.0), (4, 0.55), (8, 0.28), (16, 0.14)], 7)
neb = (neb - neb.min()) / (neb.max() - neb.min())
neb = np.clip((neb - 0.48) / 0.52, 0, 1) ** 1.9

glow = np.exp(-(band_s / 0.26) ** 2).astype(np.float32)
neb *= glow * 0.55 + 0.12

img[..., 0] += neb * 0.020
img[..., 1] += neb * 0.017
img[..., 2] += neb * 0.052

img[..., 0] += glow * 0.007
img[..., 1] += glow * 0.008
img[..., 2] += glow * 0.019

del cl, vx, vy, vz, LON, LAT, neb, glow, band_s


# --------------------------------------------------------------- estrelas
def sample_sphere(n, rng, concentrate=None):
    if concentrate is None:
        z = rng.uniform(-1, 1, n)
        th = rng.uniform(0, 2 * np.pi, n)
        r = np.sqrt(1 - z * z)
        return np.stack([r * np.cos(th), r * np.sin(th), z], 1)
    s = np.clip(rng.normal(0, concentrate, n), -1, 1)
    th = rng.uniform(0, 2 * np.pi, n)
    r = np.sqrt(np.maximum(1 - s * s, 0))
    lx, ly, lz = r * np.cos(th), r * np.sin(th), s
    p = np.array([px, py, pz])
    a = np.array([0.0, 0.0, 1.0])
    if abs(float(np.dot(a, p))) > 0.9:
        a = np.array([1.0, 0.0, 0.0])
    e1 = np.cross(a, p)
    e1 = e1 / np.linalg.norm(e1)
    e2 = np.cross(p, e1)
    return lx[:, None] * e1 + ly[:, None] * e2 + lz[:, None] * p


def splat(target, xs, ys, amps, sig_x, sig_y, cols):
    kx = max(1, int(np.ceil(2.8 * float(sig_x.max()))))
    ky = max(1, int(np.ceil(2.8 * float(sig_y.max()))))
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
            xx = np.mod(xi + dx, W)[ok]          # wrap horizontal
            for c in range(3):
                np.add.at(target[..., c], (yv, xx), w * cols[ok, c])


def draw_stars(n, rng, concentrate, bright_scale):
    v = sample_sphere(n, rng, concentrate)
    la = np.arcsin(np.clip(v[:, 2], -1, 1))
    lo = np.arctan2(v[:, 1], v[:, 0])
    xs = (lo + np.pi) / (2 * np.pi) * W
    ys = (np.pi / 2 - la) / np.pi * H

    u = rng.random(n)
    # A soma acontece em luz linear e so depois vira sRGB; a curva de gama
    # expande muito a cauda da gaussiana, entao sigma precisa ficar bem abaixo
    # de 1px para a estrela sair como ponto e nao como algodao.
    amp = ((u ** 6) * 0.95 + 0.007) * bright_scale
    sig = 0.45 + (u ** 8) * 0.60

    t = rng.normal(0, 1, n)
    cols = np.stack([
        np.clip(1.0 - 0.055 * t, 0.72, 1.0),
        np.clip(1.0 - 0.012 * np.abs(t), 0.82, 1.0),
        np.clip(1.0 + 0.055 * t, 0.78, 1.0),
    ], 1).astype(np.float32)

    stretch = np.clip(1.0 / np.maximum(np.cos(la), 1e-6), 1.0, 6.0)
    sx_all = sig * stretch
    sbin = np.digitize(stretch, [1.25, 1.9, 3.0, 4.5])
    cbin = np.digitize(sig, [0.7, 1.0, 1.5])
    for b in np.unique(sbin):
        for c in np.unique(cbin):
            m = (sbin == b) & (cbin == c)
            if m.any():
                splat(img, xs[m], ys[m], amp[m], sx_all[m], sig[m], cols[m])


draw_stars(24000, np.random.default_rng(11), None, 0.62)
draw_stars(15000, np.random.default_rng(12), 0.14, 0.55)
draw_stars(160, np.random.default_rng(13), None, 1.7)

# ------------------------------------------------------------- finalizacao
img = np.clip(img, 0, 1)
srgb = np.where(img <= 0.0031308, img * 12.92, 1.055 * img ** (1 / 2.4) - 0.055)
srgb = srgb + RNG.uniform(-0.5, 0.5, srgb.shape) / 255.0
out = np.clip(srgb * 255.0 + 0.5, 0, 255).astype(np.uint8)

d = np.abs(out[:, 0].astype(int) - out[:, -1].astype(int)).mean()
print("diferenca media coluna 0 vs W-1:", round(float(d), 3))

iio.imwrite(OUT, out, quality=94)
print("ok", out.shape)
