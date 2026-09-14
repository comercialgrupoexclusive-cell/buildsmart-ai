# ceu-profundo-4k.jpg

- **Origem:** gerado neste próprio repositório por `scripts/gerar-panorama-360.py`.
  Não é um asset de terceiros: não há licença externa envolvida, e nada é
  carregado por hotlink.
- **Formato:** JPEG equiretangular 4096×2048 (proporção 2:1), costura
  horizontal contínua.
- **Como regerar:** `pip install numpy imageio && python3 scripts/gerar-panorama-360.py`
  (a semente é fixa, então o resultado é determinístico).

## Por que gerado e não baixado

O panorama enviado para esta etapa (`rogland_clear_night_4k.hdr`, Poly Haven,
CC0) é Radiance HDR bruto de ~28 MB: o `photo-sphere-viewer` carrega JPG/PNG,
não `.hdr`, e o arquivo também excede o limite de download do conector usado
para buscá-lo. O ambiente de execução desta etapa também bloqueia saída HTTPS
para hosts externos, o que inviabilizou baixar uma alternativa gratuita.

Trocar o fundo depois é um passo só: substituir este arquivo por outro JPG
equiretangular 2:1, ou apontar `PANORAMA` em `app/experimento-360/Panorama360.tsx`
para o novo caminho.
