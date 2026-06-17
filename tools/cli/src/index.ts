#!/usr/bin/env node
import { program } from 'commander'
import { backlogCmd } from './commands/backlog.js'
import { migrateCmd } from './commands/migrate.js'
import { rlsCmd } from './commands/rls.js'
import { codegenCmd } from './commands/codegen.js'
import { dalCmd } from './commands/dal.js'
import { routeCmd } from './commands/route.js'
import { seedCmd } from './commands/seed.js'
import { envCmd } from './commands/env.js'
import { webhookCmd } from './commands/webhook.js'
import { gatesCmd } from './commands/gates.js'
import { phaseCmd } from './commands/phase.js'
import { costCmd } from './commands/cost.js'
import { prCmd } from './commands/pr.js'
import { licenseCmd } from './commands/license.js'

program.name('tool').description('Docmee DevTools CLI').version('0.1.0')
program.addCommand(backlogCmd)
program.addCommand(migrateCmd)
program.addCommand(rlsCmd)
program.addCommand(codegenCmd)
program.addCommand(dalCmd)
program.addCommand(routeCmd)
program.addCommand(seedCmd)
program.addCommand(envCmd)
program.addCommand(webhookCmd)
program.addCommand(gatesCmd)
program.addCommand(phaseCmd)
program.addCommand(costCmd)
program.addCommand(prCmd)
program.addCommand(licenseCmd)
program.parse()
