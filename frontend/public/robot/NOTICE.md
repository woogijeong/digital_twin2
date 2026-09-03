# Robot assets

`indy7.urdf` and `meshes/indy7/visual/*.stl` are derived from
[neuromeka-robotics/indy-ros2](https://github.com/neuromeka-robotics/indy-ros2)
(`humble-indyDCP3` branch), `indy_description` package, licensed BSD-3-Clause.

The only modification is rewriting absolute `<mesh filename>` paths to
paths relative to this directory, via `scripts/fetch_urdf_assets.py`.
