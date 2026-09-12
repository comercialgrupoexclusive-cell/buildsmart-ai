import {
  Container,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture
} from 'pixi.js';
import { Point } from '../../../../helpers/Point';
import {
  LABEL_COLOR,
  LABEL_FONT,
  LABEL_FONT_SIZE,
  METER
} from '../../constants';

// BuildSmart usabilidade mobile — a cota é usada como atalho de toque pra
// abrir a edição de comprimento da parede (Wall.onLabelMouseDown); o texto
// sozinho é pequeno demais pra tocar com o dedo, então a hitArea tem uma
// margem generosa ao redor — mesmo padrão de WallNode (visual pequeno,
// toque grande).
const LABEL_TOUCH_PADDING = 14;

export class Label extends Container {
  text: Text;
  textStyle: TextStyle = new TextStyle({
    fontFamily: LABEL_FONT,
    fontSize: LABEL_FONT_SIZE,
    fill: LABEL_COLOR,
    align: 'center'
  });
  textBkg: Sprite = new Sprite(Texture.WHITE);
  constructor(sizeInPixels?: number) {
    super();
    if (!sizeInPixels) {
      sizeInPixels = 0;
    }
    this.text = new Text({ text: '', style: this.textStyle });
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.update(sizeInPixels);

    this.addChild(this.textBkg);
    this.addChild(this.text);
    this.pivot.set(this.width / 2, this.height / 2);
    this.zIndex = 1001;
  }

  public update(sizeInPixels: number) {
    this.text.text = this.toMeter(sizeInPixels);
    this.textBkg.width = this.text.width;
    this.textBkg.height = this.text.height;
    this.hitArea = new Rectangle(
      -LABEL_TOUCH_PADDING,
      -LABEL_TOUCH_PADDING,
      this.text.width + LABEL_TOUCH_PADDING * 2,
      this.text.height + LABEL_TOUCH_PADDING * 2
    );
  }

  public updatePos(pos: Point, sizeInPixels: number) {
    this.position.set(pos.x, pos.y);
    this.update(sizeInPixels);
  }

  private toMeter(size: number) {
    size = Math.abs(size) / METER;

    // truncating to the 2nd decimal
    const sizeLabel = (Math.round(size * 100) / 100).toFixed(2);

    return sizeLabel + 'm';
  }
}
