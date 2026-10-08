/** Уровни адреса — от крупного к мелкому. */
export type Level =
  | 'index'
  | 'country'
  | 'region'
  | 'district'
  | 'city'
  | 'settlement'
  | 'area'
  | 'street'
  | 'house'
  | 'building'
  | 'flat';

export const LEVEL_ORDER: Level[] = ['index', 'country', 'region', 'district', 'city', 'settlement', 'area', 'street', 'house', 'building', 'flat'];

export const LEVEL_LABELS: Record<Level, string> = {
  index: 'Индекс',
  country: 'Страна',
  region: 'Регион',
  district: 'Район / округ',
  city: 'Город',
  settlement: 'Населённый пункт',
  area: 'Микрорайон / территория',
  street: 'Улица',
  house: 'Дом',
  building: 'Корпус / строение',
  flat: 'Квартира / помещение',
};

export const levelRank = (l: Level) => LEVEL_ORDER.indexOf(l);

export interface AddrType {
  id: string;
  level: Level;
  /** Каноническое сокращение: «ул.». */
  short: string;
  /** Полное слово: «улица». */
  full: string;
  /** Варианты написания (в нижнем регистре, без конечной точки). */
  variants: string[];
  /** Где тип стоит относительно названия: «ул. Ленина» (before) или «Аскизский р-н» (after). */
  placement: 'before' | 'after';
  /** После типа ожидается номер (дом, квартира…). */
  numbered?: boolean;
}

/** Часть адреса для показа в интерфейсе. */
export interface AddressPart {
  level: Level | null;
  levelLabel: string;
  /** Как часть выглядит по шаблону. */
  text: string;
  /** Найдена в справочнике. */
  known: boolean;
  /** Полная цепочка по справочнику: «с. Аскиз, Аскизский р-н, Респ. Хакасия». */
  chain?: string;
  status: 'ok' | 'error' | 'confirm';
}
