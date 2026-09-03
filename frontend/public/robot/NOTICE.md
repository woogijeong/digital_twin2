# Robot assets

`indy7.urdf` and `meshes/indy7/visual/*.stl` are derived from
[neuromeka-robotics/indy-ros2](https://github.com/neuromeka-robotics/indy-ros2)
(`humble-indyDCP3` branch), `indy_description` package, licensed BSD-3-Clause.

Modifications made by `scripts/fetch_urdf_assets.py`:
- every `<mesh filename>` (visual **and** collision) is rewritten to a path
  relative to this directory pointing at the downloaded visual STL;
- only the visual meshes are downloaded (the viewer never parses collision).
