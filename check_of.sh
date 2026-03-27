#!/bin/bash
if [ -f /usr/lib/openfoam/openfoam2406/etc/bashrc ]; then
    source /usr/lib/openfoam/openfoam2406/etc/bashrc
    which simpleFoam && echo "OPENFOAM_OK" || echo "OPENFOAM_NO_BINARY"
else
    # Check if still installing
    dpkg -l | grep openfoam && echo "OPENFOAM_INSTALLING" || echo "OPENFOAM_NOT_FOUND"
fi
