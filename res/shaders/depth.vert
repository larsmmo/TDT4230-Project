#version 430 core

in layout(location = 0) vec3 position;

uniform layout(location = 1) mat4 model;

void main()
{
	gl_Position = model * vec4(position, 1.0f);
}
