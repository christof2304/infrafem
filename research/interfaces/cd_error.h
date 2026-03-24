#pragma once

typedef enum cd_error_t
{
   CD_ERR_NONE = 0,
   CD_ERR_TOLONG = 1,
   CD_ERR_TOOLONG = 1,
   CD_ERR_DATAEND = 2,
   CD_ERR_NOTFOUND = 3,
   CD_ERR_NOLOCK = 4,
   CD_ERR_CDB_ERROR = 5,
   CD_ERR_NOFILE = 10,
   CD_ERR_CORRUPT = 99 /* Database is corrupt. user has to delete it */
} cd_err_type;
