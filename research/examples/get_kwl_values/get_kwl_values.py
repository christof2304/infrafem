# +============================================================================+
# | Company:   SOFiSTiK AG                                                     |
# | Version:   SOFiSTiK 2026                                                   |
# +============================================================================+

import os               # for the environment variable necessary, this is a great tool
from ctypes import *    # read the functions from the cdb

# This example has been tested with Python 3.12.2 (64-bit)

# See for more information: https://docs.python.org/3/whatsnew/3.8.html#ctypes
os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\64bit")
os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026")

cdb_dll = cdll.LoadLibrary("sof_cdb_w-2026.dll")

# Connect to CDB
cdb_index = c_int()

# Input the cdb path here
filename = r"testname.cdb"

# Important: Unicode call!
cdb_index.value = cdb_dll.sof_cdb_init(filename.encode("utf-8"), 99)

# Get the CDB status
cdb_stat = c_int()
cdb_stat.value = cdb_dll.sof_cdb_status(cdb_index.value)

# Print the Status of the CDB
print("CDB Status:", cdb_stat.value)

# Return value of kenq will be stored here
# (in our example for KWH=1, KWL=material number)
kwls = c_int()

# Get maximum material for KWH = 1 (required for the loop below)
cdb_dll.sof_cdb_kenq(byref(c_int(1)), byref(kwls), +2)
max_material = kwls.value

# Reset kwls
kwls = c_int()
mat = 0

# Print out all KWL for record KWH = 1 (materials)
while mat < max_material:  # loop next material until max. material is reached
    cdb_dll.sof_cdb_kenq(byref(c_int(1)), byref(kwls), +1)
    if cdb_dll.sof_cdb_kexist(1, kwls.value) > 0:  # check again if record exists
        mat = kwls.value
        print(mat)

# Close the CDB, 0 - will close all the files
cdb_dll.sof_cdb_close(0)

# Print again the status of the CDB, if status = 0 -> CDB Closed successfully
cdb_stat.value = cdb_dll.sof_cdb_status(cdb_index.value)
if cdb_stat.value == 0:
    print("CDB closed successfully, status = 0")
