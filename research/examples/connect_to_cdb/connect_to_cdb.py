# +============================================================================+
# | Company:   SOFiSTiK AG                                                     |
# | Version:   SOFiSTiK 2026                                                   |
# +============================================================================+

import os               # use to load DLL
from ctypes import *    # read the functions from the cdb

# This example has been tested with Python 3.12.2 (64-bit)

# See for more information: https://docs.python.org/3/whatsnew/3.8.html#ctypes
os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\64bit")
os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026")

cdb_dll = cdll.LoadLibrary("sof_cdb_w-2026.dll")

# Connect to CDB
cdb_index = c_int()

# Input the cdb path here
filename = r"S:\test\testname.cdb"

# Important: Unicode call!
cdb_index.value = cdb_dll.sof_cdb_init(filename.encode("utf-8"), 99)

# Get the CDB status
cdb_stat = c_int()
cdb_stat.value = cdb_dll.sof_cdb_status(cdb_index.value)

# Print the Status of the CDB
print("CDB Status:", cdb_stat.value)

# Close the CDB, 0 - will close all the files
cdb_dll.sof_cdb_close(0)

# Print again the status of the CDB, if status = 0 -> CDB Closed successfully
cdb_stat.value = cdb_dll.sof_cdb_status(cdb_index.value)
if cdb_stat.value == 0:
    print("CDB closed successfully, status = 0")
