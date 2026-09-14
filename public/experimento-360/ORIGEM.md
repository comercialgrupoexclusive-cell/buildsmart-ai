# ceu-profundo-4k.jpg

Panorama equiretangular (2:1, 4096×2048) usado como textura 360° do ambiente.

- **Origem:** gerado neste repositório por `scripts/gerar-panorama-360.py`.
  Não é asset de terceiros; nenhuma licença externa envolvida; nada por hotlink.
- **Conteúdo:** céu noturno com Via Láctea, cordilheiras em camadas com névoa no
  vale, brilho de pôr do sol num lado e primeiro plano rochoso — reproduz a
  composição da referência ("fundoTellus 360").
- **Regerar:** `pip install numpy imageio && python3 scripts/gerar-panorama-360.py`
  (semente fixa → resultado determinístico).

## Trocar pelo panorama real (1 passo)

Este é um substituto gerado. Para usar o panorama 4K real (foto), basta
**substituir este arquivo** por outro JPG/PNG equiretangular 2:1 com o mesmo
nome e caminho (`public/experimento-360/ceu-profundo-4k.jpg`). Nenhuma mudança
de código é necessária — a rotação, o enquadramento inicial e a projeção já
funcionam para qualquer equiretangular 2:1.

Motivo de ainda ser gerado: as imagens enviadas nesta sessão chegam por
WhatsApp e não são gravadas no disco do ambiente, e a saída HTTPS é bloqueada,
então não foi possível baixar o arquivo original aqui. A troca local resolve.
