import { describe, expect, it } from 'vitest';
import { fileStem, fioFields, guessIncomingKind, sectionFolder, strongGuess, tidyFio } from './incoming';

describe('файл, перетащенный в окно', () => {
  it('угадывает, что за файл', () => {
    expect(guessIncomingKind('Анкеты 2025.xlsx')).toBe('table');
    expect(guessIncomingKind('паспорт_фамилия.jpg')).toBe('scans');
    expect(guessIncomingKind('СНИЛС.pdf')).toBe('scans');
    expect(guessIncomingKind('фото 3x4.png')).toBe('photos');
    expect(guessIncomingKind('Грамота 2025.pdf')).toBe('achievements');
    expect(guessIncomingKind('Характеристика.docx')).toBe('characteristic');
    // Картинка или PDF без подсказок в имени — скан; остальное — «Другое».
    expect(guessIncomingKind('IMG_0001.JPG')).toBe('scans');
    expect(guessIncomingKind('без имени', 'image/png')).toBe('scans');
    expect(guessIncomingKind('архив.zip')).toBe('other');
  });

  it('уверенная догадка — только по таблице или словам в имени', () => {
    expect(strongGuess('IMG_0002.jpg')).toBeNull();
    expect(strongGuess('Список.csv')).toBe('table');
    expect(strongGuess('фото.jpg')).toBe('photos');
    expect(strongGuess('Диплом.pdf')).toBe('achievements');
  });

  it('раздел личной папки', () => {
    expect(sectionFolder('scans')).toBe('Сканы');
    expect(sectionFolder('photos')).toBe('Фотографии');
    expect(sectionFolder('achievements')).toBe('Достижения');
    expect(sectionFolder('characteristic')).toBe('Характеристика');
    expect(sectionFolder('other')).toBe('');
  });

  it('ФИО из поля — в поля базы людей', () => {
    expect(tidyFio('  фамилия   имя  отчество ')).toBe('Фамилия Имя Отчество');
    expect(tidyFio('фамилия-вторая имя')).toBe('Фамилия-Вторая Имя');
    expect(tidyFio('ДеФамилия')).toBe('ДеФамилия');
    expect(fioFields('фамилия имя отчество')).toEqual({ 'person.lastName': 'Фамилия', 'person.firstName': 'Имя', 'person.middleName': 'Отчество' });
    expect(fioFields('Фамилия Имя')).toEqual({ 'person.lastName': 'Фамилия', 'person.firstName': 'Имя' });
    expect(fioFields('Фамилия')).toBeNull();
    expect(fioFields('   ')).toBeNull();
  });

  it('имя файла без расширения', () => {
    expect(fileStem('Скан.паспорта.JPG')).toBe('Скан.паспорта');
    expect(fileStem('README')).toBe('README');
  });
});
