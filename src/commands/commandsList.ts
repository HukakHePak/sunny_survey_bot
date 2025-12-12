import CommandNames from './commandNames';

export const fullCommands = [
  { command: CommandNames.Start, description: 'Запустить бота' },
  { command: CommandNames.Add, description: 'Добавить номинацию' },
  { command: CommandNames.List, description: 'Показать номинации' },
  { command: CommandNames.Remove, description: 'Удалить номинацию' },
  { command: CommandNames.Survey, description: 'Возобновить/остановить голосование' },
  { command: CommandNames.RepeatVote, description: 'Разрешить/запретить повторное голосование' },
  { command: CommandNames.Results, description: 'Показать результаты' },
  { command: CommandNames.Stats, description: 'Статус бота' },
];

export const minimalCommands = [
  { command: CommandNames.Start, description: 'Запустить бота' },
  { command: CommandNames.Update, description: 'Обновить интерфейс' },
];

export default { fullCommands, minimalCommands };
