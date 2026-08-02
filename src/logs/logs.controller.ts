import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
}
