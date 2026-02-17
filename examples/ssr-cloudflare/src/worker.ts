import { createHandler } from '@vertz/cloudflare'
import { app } from './app'

export default createHandler(app)
