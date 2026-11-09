function validarEntornoDemo(env, args, database) {
  if (env.NODE_ENV === 'production') throw new Error('Carga demo prohibida en producción');
  if (!database || !/(?:^|_)(?:demo|test)$/i.test(database)) {
    throw new Error('La base de destino debe terminar en _demo o _test');
  }
  const flag = args.indexOf('--confirm-demo');
  if (flag < 0 || args[flag + 1] !== database) {
    throw new Error('Confirme la base explícitamente: --confirm-demo ' + database);
  }
}
module.exports = { validarEntornoDemo };
