# +============================================================================+
# | Company:   SOFiSTiK AG                                                     |
# | Version:   SOFiSTiK 2026                                                   |
# +============================================================================+

# This example has been tested with Python 3.12.2 (64-bit)

################################### IMPORT ####################################

from dlls import *

################################### SOURCE ####################################

### READ FROM CDB ###
"""
do while ie == 0, see cdbase.chm, Returnvalue.
    = 0 -> No error
    = 1 -> Item is longer than Data
    = 2 -> End of file reached
    = 3 -> Key does not exist
"""

# Read the fck value from the CDB
if cdb_dll.sof_cdb_kexist(1, 1) == 2:  # the key exists and contains data
    ie = c_int(0)
    rec_len = c_int(sizeof(cmat_conc))
    while ie.value < 2:
        ie.value = cdb_dll.sof_cdb_get(
            cdb_index, 1, 1, byref(cmat_conc), byref(rec_len), 1
        )
        if cmat_conc.m_id == 1.0:
            fck = cmat_conc.m_fck
        rec_len = c_int(sizeof(cmat_conc))


# Read fy value from the CDB
if cdb_dll.sof_cdb_kexist(1, 2) == 2:  # the key exists and contains data
    ie = c_int(0)
    rec_len = c_int(sizeof(cmat_stee))
    while ie.value < 2:
        ie.value = cdb_dll.sof_cdb_get(
            cdb_index, 1, 2, byref(cmat_stee), byref(rec_len), 1
        )
        if cmat_stee.m_id == 1.0:
            fy = cmat_stee.m_fy
        rec_len = c_int(sizeof(cmat_stee))

# Read su, so, h and b values from the CDB
if cdb_dll.sof_cdb_kexist(9, 1) == 2:  # the key exists and contains data
    ie = c_int(0)
    rec_len = c_int(sizeof(csect_rec))
    while ie.value == 0:
        ie.value = cdb_dll.sof_cdb_get(
            cdb_index, 9, 1, byref(csect_rec), byref(rec_len), 1
        )
        if csect_rec.m_id == 10.0:
            b = csect_rec.m_b
            h = csect_rec.m_h
            su = csect_rec.m_su
            so = csect_rec.m_so
        rec_len = c_int(sizeof(csect_rec))


# Read the Med and Ned internal forces from CDB
if cdb_dll.sof_cdb_kexist(102, 1001) == 2:  # the key exists and contains data
    ie = c_int(0)
    n_ed = 0.0
    m_ed = 0.0
    rec_len = c_int(sizeof(cbeam_foc))
    while ie.value == 0:
        ie.value = cdb_dll.sof_cdb_get(
            cdb_index, 102, 1001, byref(cbeam_foc), byref(rec_len), 1
        )
        if cbeam_foc.m_id == 0.0:
            if abs(n_ed) < abs(cbeam_foc.m_n) and abs(cbeam_foc.m_n < 1e30):
                n_ed = cbeam_foc.m_n
            if abs(m_ed) < abs(cbeam_foc.m_my) and cbeam_foc.m_my < 1e30:
                m_ed = cbeam_foc.m_my
        rec_len = c_int(sizeof(cbeam_foc))


### ITERATION AND DESIGN ###

fcd = fck / 1.5 * 0.85
fyd = fy / 1.15
epss = 25.0
epsc = 0.0
m_rd = 0.0
mu = 0.0
alpha = 0.0
xi = 0.0
x = 0
d = h - su
ka = 0.0
z = 0.0
zeta = 0.0
omega = 0.0
a_s1 = 0.0
m_eds = m_ed - n_ed * (h / 2 - su)

while m_rd <= m_eds and mu < 0.296:
    if 0 < epsc <= 2:
        alpha = epsc / 12 * (6 - epsc)
    elif 2 < epsc <= 3.5:
        alpha = (3 * epsc - 2) / (3 * epsc)

    # Calculate the Xi value
    xi = epsc / (epss + epsc)

    # Calculate x
    x = xi * d

    # Calculate ka
    if 0 < epsc <= 2:
        ka = (8 - epsc) / (4 * (6 - epsc))
    elif 2 < epsc <= 3.5:
        ka = (epsc * (3 * epsc - 4) + 2) / (2 * epsc * (3 * epsc - 2))

    # Calculate z
    z = d - ka * x

    # Calculate zeta
    zeta = 1 - ka * xi

    # Calculate omega
    omega = alpha * xi

    # Calculate mu
    mu = alpha * xi * zeta

    # Calculate the Mrd value
    m_rd = alpha * xi * d * b * fcd * zeta * d

    # Required reinforcement
    a_s1 = (1 / fyd) * (omega * b * d * fcd + n_ed)

    if epsc == 3.5:
        epss = 25

        while m_rd <= m_eds and epss >= 0.0 and mu < 0.296:
            if 0 < epsc <= 2.0:
                alpha = epsc / 12 * (6 - epsc)
            elif 2.0 < epsc <= 3.5:
                alpha = (3 * epsc - 2) / (3 * epsc)

        # Calculate the Xi value
        xi = epsc / (epss + epsc)

        # Calculate x
        x = xi * d

        # Calculate ka
        if 0 < epsc <= 2:
            ka = (8 - epsc) / (4 * (6 - epsc))
        elif 2.0 < epsc <= 3.5:
            ka = (epsc * (3 * epsc - 4) + 2) / (2 * epsc * (3 * epsc - 2))

        # Calculate z
        z = d - ka * x

        # Calculate zeta
        zeta = 1 - ka * xi

        # Calculate omega
        omega = alpha * xi

        # Calculate mu
        mu = alpha * xi * zeta

        # Calculate Mrd value
        m_rd = alpha * xi * d * b * fcd * zeta * d

        # Required reinforcement
        a_s1 = (1 / fyd) * (omega * b * d * fcd + n_ed)

        if epss == 0.0:
            print("Reinforcement reached 0[o/oo], iteration stopped!")

        epss -= 0.001
    epsc += 0.001

# Close the CDB, 0 - will close all the files
cdb_dll.sof_cdb_close(0)

### OUTPUT ###

print("Ned = {0} kN".format(str(n_ed)))
print("Med = {0} kNm".format(str(m_ed)))
print("Meds = {0} kNm".format(str(m_eds)))

print("----------------------------")

print("fcd = {0} MPa".format(str(fcd / 1000)))
print("fyd = {0} MPa".format(str(fyd / 1000)))
print("epsc = {0} o/oo".format(str(epsc)))
print("epss = {0} o/oo".format(str(epss)))
print("alpha = {0}".format(str(alpha)))
print("ka = {0}".format(str(ka)))
print("z = {0} cm".format(str(z * 100)))
print("zeta = {0}".format(str(zeta)))
print("omega = {0}".format(str(omega)))
print("mu = {0}".format(str(mu)))
print("d = {0} cm".format(str(d * 100)))
print("Xi = {0}".format(str(xi)))
print("x = {0} cm".format(str(x * 100)))
print("Mrd = {0} kNm".format(str(m_rd)))

print("----------------------------")

print("As1 = {0} cm2".format(str(a_s1 * 100**2)))

# Print CDB Status
cdb_stat.value = cdb_dll.sof_cdb_status(cdb_index.value)
print("CDB Status after closing:", cdb_stat.value)
